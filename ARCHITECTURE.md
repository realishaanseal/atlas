# Atlas — Architecture

How Atlas is built, and why. It is a private, end-to-end encrypted workspace
for exactly two people, and it runs entirely on free tiers: Firebase's Spark
plan for the database, auth and hosting, and nothing else. Most decisions below
come back to one of those two constraints — two people, no budget — and to
the premise that the server should learn as little as possible.

Every number quoted here lives in `src/config.ts` or `firestore.rules`. If the
two disagree with this document, they win.

---

## 1. Overview

```
 browser (device A)                   Firebase (Spark)                  browser (device B)
┌──────────────────────┐          ┌───────────────────────┐          ┌──────────────────────┐
│ passphrase → PBKDF2  │          │ Anonymous Auth (uid)  │          │ passphrase → PBKDF2  │
│ → AES-256-GCM key    │─ciphertext▶ Firestore            ◀ciphertext─│ → AES-256-GCM key    │
│ encrypt / decrypt    │          │  + Security Rules     │          │ encrypt / decrypt    │
│ (never leaves here)  │          │ Hosting (static app)  │          │ (never leaves here)  │
└──────────┬───────────┘          └───────────────────────┘          └──────────┬───────────┘
           └──────────── WebRTC media, peer-to-peer (DTLS-SRTP) ──────────────────┘
```

- **The browser does all the cryptography.** The passphrase and the derived
  key never leave it.
- **Firestore stores ciphertext and routing metadata** — which slot sent a
  message, and when — and nothing else.
- **Security Rules are the second line of defence**: they enforce document
  shape, pairing and retention. They are not the confidentiality boundary; even
  a total rules bypass yields ciphertext.
- **Calls are peer-to-peer.** Firestore only carries the (encrypted) signalling.

---

## 2. Why Firestore

Realtime Database was the alternative. Four things decided it:

- **Rules that can validate shape.** Firestore rules can require an exact key
  set, field types, byte lengths and cross-document lookups. Since the server
  cannot read the content, validating its shape is the only server-side
  integrity control available, and RTDB's path predicates cannot express it.
- **Offline persistence.** `persistentLocalCache` means a reconnect resumes
  from a local snapshot and pulls only the delta — which matters against a
  50k-reads-a-day quota.
- **Query model.** `orderBy('createdAt').limit(n)` with cursor pagination is
  native.
- **Free-tier fit.** Everything below runs on Spark without a card attached,
  where quotas block rather than bill.

The cost is presence. RTDB's `onDisconnect()` lets the server mark a client
offline; Firestore has no equivalent. Atlas uses heartbeat-plus-staleness
instead (§7), which turns out to be self-healing in a way `onDisconnect` is not.

---

## 3. Cryptography

### Key derivation

Both people type the same passphrase. It is stretched with
**PBKDF2-HMAC-SHA256, 2,000,000 iterations**, over a 16-byte random salt stored
publicly at `rooms/{id}/meta/kdf`. The output is a 256-bit AES-GCM key created
with `extractable: false`, so it cannot be read back out of the browser — not by
an injected script, not by Atlas's own code. It is held in a React ref, never in
state, so it cannot end up in a devtools snapshot or an error payload.

Derivation runs in a **Web Worker** that is terminated as soon as it finishes:
two million iterations would otherwise freeze the UI mid-unlock, and confining
the passphrase to a short-lived worker narrows the time it exists in memory.
The same `derivePbkdf2` function also runs inline where Workers are
unavailable, so there is one implementation of the critical path.

The KDF document is public, so it is treated as hostile input: a document
claiming fewer than 600,000 iterations is refused rather than used. A tampered
document cannot quietly weaken the key.

**Why not Argon2id.** It is the better KDF, but Web Crypto has no native
implementation; using it means shipping a WASM blob and hand-tuning its memory
parameters. The `KdfParams.v` field exists so the scheme can be migrated later
without breaking stored messages.

### Verifying the passphrase

Comparing hashes would add a second, weaker path to the same secret. Instead
the KDF document holds a **verifier**: a fixed known string encrypted under the
derived key. If GCM's authentication tag validates on decryption, the key is
right. A wrong passphrase fails exactly like a corrupted blob, so a failure
leaks nothing.

### Passphrase policy

The passphrase is the whole security of the system (§3, *Forward secrecy*), so
setup enforces a floor: at least 12 characters and an "acceptable" score from a
strength estimator, shown as a three-step meter. A generator offers six words
plus four digits (about 45 bits) for people who would rather not choose.

Failed unlocks back off: free for three attempts, then 10 s doubling up to a
six-hour cap. The counter lives in this browser's IndexedDB, so it slows a
person guessing at an unlocked machine and does nothing against an offline
attacker with the ciphertext — for that, only the iteration count and the
passphrase's length matter.

### Messages

**AES-256-GCM** with a fresh 12-byte IV from `crypto.getRandomValues()` on
every encryption. IVs are never derived, counted or cached: IV reuse under a
fixed key is the one mistake that breaks GCM outright.

The whole payload is encrypted as one blob, including what kind of message it
is. A message document holds `{ sender, createdAt, expiresAt, body: { v, iv, ct } }`
and, later, delivery and read timestamps and the reactions map (§9).

**Length hiding.** Ciphertext is the same length as its plaintext, so text is
padded to the next bucket of 256, 512, 1,024, 2,048 or 4,096 bytes before
encryption — "ok" and a paragraph look the same. A tag byte inside the
ciphertext distinguishes three encodings: padded text, JSON media, and padded
JSON for text with a reply attached.

### Media

Photos, GIFs, videos, voice notes and files share one pipeline:

1. A random 256-bit **content key per item**, wrapped under the conversation
   key and carried inside the encrypted message.
2. The ciphertext goes into the item's **own collection** (`images/`,
   `videos/`, `audio/`, `files/`), so subscribing to the message list never
   drags media along with it.
3. Anything larger than one document is **chunked** at 600 KB per document,
   under Firestore's 1 MiB cap after base64.

| Kind   | Processing                                                    | Limit                 |
| ------ | ------------------------------------------------------------- | --------------------- |
| Photo  | Re-encoded to WebP, ≤ 1600 px, quality ladder 0.82 → 0.4      | one 600 KB document   |
| GIF    | Stored as-is (a canvas would flatten the animation)           | 12 chunks (≈ 7 MB)    |
| Video  | Stored as-is, plus an encrypted ≤ 6 KB first-frame poster     | 45 chunks (≈ 27 MB)   |
| Voice  | Opus at 24 kbps, waveform peaks sampled live while recording  | 120 seconds           |
| File   | Opaque bytes, name and type inside the encrypted payload      | 34 chunks (≈ 20 MB)   |

**Every photo is re-encoded through a canvas**, whatever its size. That is what
strips EXIF, and phone photos carry GPS coordinates there. A 16 px blurred
preview travels inside the message so a bubble has something to show before the
full image is decrypted.

Decrypted media is shown through object URLs that are revoked on unmount, and
the MIME type of a decrypted blob is never taken from the payload (§11).

### Forward secrecy

There is none, and no post-compromise security. Anyone who learns the
passphrase can decrypt every message they ever captured. That is the trade for
having no key exchange at all, and it suits two people who can agree a
passphrase in person once. The practical consequence is that the passphrase
should be long and generated, not memorable.

---

## 4. Identity and pairing

**Anonymous Auth** gives Security Rules a stable `uid` to bind a device to. It
is not a login and the user never sees it; the passphrase is the actual gate.

The **room document** holds the device slots as fields, not as a collection:
`deviceA`, `deviceA2`, `deviceA3` and `deviceB`. Rules cannot count a collection
cheaply, so a fixed set of fields makes the cap structural — there is no fifth
field to write. The A side may hold up to three devices (two laptops and a
phone, say); B holds one. Pairing is checked with a single cached `get()`.

- **The first device to unlock** an empty slot claims it. An unknown device
  always lands on the B side, the safer assumption.
- **Adding one of your own devices** opens a five-minute window
  (`linkTarget: 'a'`) during which the next device to unlock fills an empty A
  slot. The countdown is visible because that window is the only time the
  passphrase alone puts someone on your side.
- **Replacing a device** opens a five-minute `repairUntil` window from an
  already-paired device, during which a new device may take over a slot. Rules
  check that only a paired device can open it and that it cannot exceed five
  minutes.
- **If every device is lost**, recovery is a Firebase console operation:
  delete the room document. There is deliberately no client path to wiping
  pairing state, because that path is exactly what an attacker would use.

Pairing is an **anti-nuisance control, not a security boundary**. It stops a
stranger who found the URL from writing into the conversation and burning quota.
Confidentiality is entirely the key's job.

---

## 5. Data model and Security Rules

```
rooms/{roomId}                    device slots, link/repair windows
  meta/kdf                        salt, iteration count, verifier (public by design)
  messages/{id}                   the timeline: { sender, createdAt, expiresAt, body }
  images/ videos/ audio/ files/   media ciphertext, chunked
  presence/{a|b}                  online, lastSeen, typingUntil
  pins/{messageId}                encrypted snapshot of a pinned message
  doodles/{id}                    encrypted strokes drawn over a message
  emojis/{id}                     the shared custom emoji pack
  nicknames/{a|b}                 the label each side gave the other, encrypted
  calls/{id}                      encrypted WebRTC signalling and ICE candidates
```

The rules deny everything by default and then, per collection:

- **Exact key sets** (`hasOnly` plus `hasAll`), types and byte ceilings — a
  message body is capped at about 12 KB of ciphertext.
- **`isPaired()`** on every read and write.
- **Sender binding**: a message's `sender` must be the slot this `uid` holds.
- **Narrow updates**: after creation a message may change only in these ways,
  each its own rule with an exact `affectedKeys()` set — the recipient stamps
  `deliveredAt` and `readAt` once each; either person rewrites *their own* key
  of the reactions map; the sender edits the body, with the first edit
  preserving the original alongside it; and `expiresAt` moves only while a pin
  for that message exists.
- **Narrow deletes**: only expired documents (the sweep), or a sender pulling
  back their own scheduled message before it is delivered.
- **Retention**: `expiresAt` may be at most 30 days after `createdAt`, and
  expired documents are refused to direct reads (§6).

Firebase web config values ship in the bundle. They are project identifiers,
not credentials: access control lives in the rules, and confidentiality in the
encryption.

---

## 6. Retention

**Messages and media live for 30 days**, and each message can be set shorter
(1 hour, 1 day, 7 days). Shorter is always allowed because it only destroys
data sooner; longer is refused by the rules, so no client can opt out of
retention. `RETENTION_MS` in `config.ts` and `retentionMs()` in the rules must
agree.

Firestore's native TTL policies, Cloud Functions and Cloud Storage all need the
paid Blaze plan, so there is no server-side garbage collector. Retention rests
on two layers instead:

1. **Rules refuse to serve expired documents** on direct reads — server-side,
   immediate, and not bypassable by a client.
2. **A client sweep** deletes expired documents on connect and every ten
   minutes after.

Live listeners are the one exception to the first layer: a listener's range
filter is fixed when it subscribes, so refusing expired documents mid-stream
would tear the whole listener down. The client filters them out of the UI
instead, and the sweep removes them.

Stated plainly: if nobody opens the app, expired documents stay in the database
— unreadable ciphertext that rules will not serve, but not yet *gone* — until
the next sweep. The worst case is bounded by Spark's 1 GiB storage quota, and
Spark blocks rather than bills.

**Deliberate exceptions:**

- **Pinned messages** have their `expiresAt` pushed out, along with their media.
- **The custom emoji pack** does not expire — a pack that vanished after a
  month would be pointless.
- **Scheduled messages** are written with a future `createdAt` (up to a week
  ahead). They sort into the timeline at their delivery time, the recipient's
  client hides them until then, and their 30-day clock starts at delivery. The
  database can see that a scheduled message exists and when it is due, though
  not what it says.
- **The local archive** (§9) keeps a copy on one device after the originals
  are swept.

### Free-tier budget

Spark allows 50k reads, 20k writes and 20k deletes a day, and 1 GiB stored.

| Activity                      | Daily ops, estimated |
| ----------------------------- | -------------------- |
| Presence heartbeats, 2 people | ~2,900 writes        |
| Typing, debounced to 1/2.5 s  | ~500 writes          |
| 200 messages                  | 200 writes           |
| Delivery and read receipts    | ~400 writes          |
| Message reads, cached         | ~1,000 reads         |
| Sweep                         | ~400 deletes         |

About a fifth of the write budget and well under a tenth of reads. The
heartbeat interval is the main lever if it ever gets tight.

---

## 7. Client architecture

React 19, Vite 7, TypeScript (strict, plus `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes`), Tailwind CSS v4.

### Layering

```
components → hooks → services → { crypto, firebase, storage }
```

One direction only. `services/` has no React imports — plain TypeScript, so it
stays unit-testable. `crypto/` knows nothing about Firebase, and `firebase/`
knows nothing about crypto; they meet only in `services/`, which is where
plaintext becomes ciphertext. That boundary is what let calls, files and video
be added beside messaging without the chat UI changing.

```
src/
├── components/    ui/ (Overlay, Sheet, Popover, Button), chat/, call/, layout/, settings/
├── pages/         LockScreen, UnpairedScreen, ChatRoot, Conversation
├── hooks/         React state; orchestrates services (see hooks/README.md)
├── services/      framework-free app logic (see services/README.md)
├── crypto/        derive, envelope, padding, verifier, strength
├── firebase/      SDK initialisation and Firestore paths
├── storage/       IndexedDB: device id, outbox, unlock throttle, local archive
├── motion/        spring presets, shared variants, MotionProvider
├── styles/        design tokens and global CSS
├── utils/         theming, dates, calendar export, viewport, small helpers
├── types/         domain and wire-format types
└── config.ts      every tunable constant, in one place
```

### Loading

The lock screen is the only thing on the critical path. Everything else is
split out:

| Chunk      | gzip   | Fetched                                           |
| ---------- | ------ | ------------------------------------------------- |
| app shell  | ~21 KB | first paint: entry script and stylesheet          |
| `react`    | ~60 KB | first paint                                       |
| `firebase` | ~128 KB | just after first paint, to learn setup vs unlock |
| `ChatRoot` | ~62 KB | after unlock: the conversation and every feature  |
| `motion`   | ~42 KB | after unlock: the animation runtime               |

So the lock screen paints before the Firebase SDK is parsed, and a full
unlocked session is about 330 KB gzipped. Fonts are self-hosted and subset, so
there is no third-party origin in the CSP for them.

### Sending, offline and presence

- **Optimistic sends.** A message appears at once as `pending`, is written to
  an IndexedDB **outbox**, then sent. The server echo replaces it; anything
  still in the outbox is retried on reconnect. Firestore's own offline queue
  lives in memory and is lost when a backgrounded mobile tab is evicted — the
  outbox is what survives that.
- **Presence** is heartbeat-plus-staleness: each client writes `lastSeen`
  every 45 s, and the peer treats anything older than 90 s as offline.
  **Typing** writes `typingUntil = now + 5 s` rather than "started" and
  "stopped", so a crashed tab can never leave a stuck indicator.
- **Idle auto-lock** after 15 minutes without pointer, keyboard, scroll or
  touch activity. Incoming messages deliberately do not reset it — the other
  person typing should not keep an unattended laptop unlocked. It is suspended
  during calls.

---

## 8. Design system

Tokens live once, in `@theme` in `src/styles/index.css`; Tailwind generates
utilities from them, and components contain no hex literals.

- **Ground.** A flat ink (`#0b1118`). No glow, mesh or grain on it — depth
  belongs to the surfaces.
- **Material.** Raised surfaces are lit from the upper left: a bright top lip,
  a shaded underside, a shadow falling down and to the right, and a faint sheen
  (`.depth`, `.depth-lg`, `.sheen`, `.edge-light`). Fields are pressed in
  instead (`shadow-inset`).
- **Panels are solid** (`.panel`). A menu opens inside the header, and a
  backdrop blur nested inside another one cannot see past its parent, so
  translucent menus let the content beneath show through unblurred.
- **Type.** Archivo for the interface; Martian Mono, slightly condensed, for
  labels, dates and times (`.mono` for uppercase labels, `.figures` for
  tabular numbers).
- **Colour.** A deep steel blue for anything that is yours or acts: sent
  bubbles and primary buttons use a pressed finish (`shadow-accent`) — an inner
  lip and a darker ring, no coloured halo.

**Contrast is measured, not eyeballed.** White on the solid accent is 6.4:1
(8.0:1 on its deeper stop); secondary text is 8.2:1 and muted text 6.7:1 on a
surface.

**Runtime theming.** A theme is a hue and chroma in OKLCH, from which the whole
accent palette is generated at fixed lightness levels. Because OKLCH lightness
is perceptual, white text keeps clearing 4.5:1 on any hue, and chroma is capped
so every preset — and any accent taken from a photo — stays muted. Backgrounds
can be tinted the same way, at fixed dark lightness, so no choice can make the
text unreadable. Themes are stored on the device only.

**Motion** is functional, not decorative: messages arrive, menus open, a wrong
passphrase shakes the card. The `motion` runtime is lazy-loaded behind the
lock screen, and `prefers-reduced-motion` drops every transform to an opacity
change, in both CSS and `MotionProvider`.

---

## 9. Features

**Replies.** The reply reference lives inside the encrypted payload, so the
rules did not change. The quoted excerpt is snapshotted at send time rather
than looked up, so a quote still renders after its original has expired, and
showing one costs no extra read.

**Reactions.** The one place a device may write to a message it did not send.
Each person owns one key of a `reactions` map, named for their slot, and the
rules check that you only touch your own — the slot comes from the room
document, never from the request. The value is an encrypted list, not a plain
emoji: a reaction to a message is content too. Up to 20 per person.

**Voice and video calls.** WebRTC, peer-to-peer; media is DTLS-SRTP encrypted
by the protocol. **The signalling is encrypted as well.** SDP offers and ICE
candidates contain public and local IP addresses, and writing them to the
database in plaintext — as most WebRTC examples do — would tell the server
where both people are and when they spoke. Encrypted, the database learns only
that two paired devices exchanged some ciphertext. STUN only, no TURN: no free
unlimited relay exists, so a share of connections behind strict NATs will fail,
and the app says so rather than spinning.

**GIFs.** Search goes to Giphy — the **only** outbound request that is not to
Firebase, carrying the search term and nothing else. The chosen GIF is
downloaded, encrypted and stored like any other image, so the recipient never
contacts Giphy. Without an API key the GIF button is hidden.

**Search** runs entirely on-device over the already-decrypted messages; it
costs no reads and never asks the database about your content.

**Pins** keep an encrypted snapshot of the message and extend its expiry
(§6). **Doodles** are encrypted strokes drawn over a message, expiring with it.
**Custom emoji** are a shared, encrypted, non-expiring pack. **Nicknames** are
on-device labels, with one encrypted exception so each side can see what the
other calls them.

**Local archive and export.** The A side keeps a local copy of the decrypted
conversation — text, media and the emoji it uses — in IndexedDB, so it
outlives the 30-day sweep, and can export it as one self-contained HTML file
that opens in any browser, offline, forever. **The archive is stored
unencrypted, by explicit choice**: the point is a readable keepsake, not
another vault. It is on by default and can be paused under *Chat archive*.

**Notifications** are in-tab only. They say *New message* rather than showing
text by default (`NOTIFICATIONS.SHOW_PREVIEW`), because the operating system
draws them where anyone nearby can read them.

---

## 10. Testing

`npm test` runs a Vitest suite over the crypto layer — the one place a silent
regression is genuinely dangerous, because a bug that makes messages readable
looks identical, from the UI, to one that does not. Everything else fails
visibly.

The tests assert the properties the design depends on rather than line
coverage: IV uniqueness across 500 encryptions; authenticated rejection of
tampered ciphertext and tampered IVs; that padding makes "ok" and a long
message the same size; that a tampered KDF document with a weakened iteration
count is refused; and that base64 survives buffers large enough to hit the
argument limit.

CI runs typecheck, lint, the tests and a production build on every push and
pull request.

---

## 11. Security review

A full pass over the codebase. Found and fixed:

- **Blob MIME taken from the payload.** Object URLs were built from the
  decrypted payload's MIME type. The payload is authenticated, but that only
  proves it came from someone holding the key — a payload declaring
  `text/html` would have produced a `blob:` URL that runs script in Atlas's own
  origin. MIME types for stored media are now fixed by kind and the incoming
  value ignored.
- **Unvalidated media ids.** A decrypted `imageId` went straight into a
  Firestore path, so a crafted value like `../../messages/xyz` could address a
  document it should not. Ids are now constrained to the exact shape
  `randomId()` produces, and dimensions are bounded.
- **Colour-only meaning.** Read receipts and online status relied on colour.
  Both now carry meaning in glyph and text as well.

Verified:

- No `dangerouslySetInnerHTML`, `innerHTML` or `eval`. Message text renders as
  React text nodes, which escape it.
- No `localStorage` or `sessionStorage`; IndexedDB only.
- No secrets in tracked source; `.env.local` is gitignored.
- No `console` output outside an `import.meta.env.DEV` guard.
- No error-reporting service, deliberately: exception payloads from a
  messenger tend to contain message content.

Accepted, with reasons:

- **`style-src 'unsafe-inline'`** in the CSP. Style attributes are set at
  runtime (aspect ratios, delays), and CSP nonces do not cover style
  attributes. CSS injection cannot run script, and the only untrusted input
  reaching the DOM is message text, which React escapes.
- **Client-chosen message ids.** Rules validate document shape, not the id
  format. The worst case is a paired device writing oddly named documents in
  its own room.

The security headers — CSP, HSTS, `X-Frame-Options: DENY`,
`Referrer-Policy: no-referrer`, COOP and CORP — are set in `firebase.json`.

---

## 12. Hosting and deployment

Firebase Hosting on Spark. `npm run deploy` builds, then publishes the site
and the Security Rules together, so code and rules cannot drift apart.

---

## 13. Known gaps

- **No forward secrecy** (§3).
- **No push notifications.** Messages are only seen while a tab is open. FCM
  is free on Spark, but a service worker has no key, so a push could only ever
  say "New message"; on iOS it also requires installing the site to the home
  screen.
- **No App Check.** It would bind requests to the deployed frontend — a
  hardening measure rather than a fix for a known gap.
- **STUN-only calling** (§9).
- **GIFs are not EXIF-stripped**, because re-encoding would destroy the
  animation. Giphy results carry no metadata; a GIF from elsewhere might.
- **Deletion depends on a client connecting** (§6).
