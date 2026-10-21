# Atlas — Architecture

Phase 1 decision record. Everything here is open to revision before Phase 2 begins.

---

## 1. Database choice: Cloud Firestore

**Decision: Firestore, not Realtime Database.**

The two are close for a workload this small, but four things decide it:

**Security Rules expressiveness.** This is the big one. Firestore rules can validate the *shape* of a write — exact key sets, field types, byte lengths, and cross-document lookups. RTDB rules are JSON-path predicates and cannot express "this document must have exactly these six keys, `body.ct` must be under 8 KB, and `expiresAt` must equal `createdAt + retentionMs()`". Since the ciphertext is opaque to the server, shape validation is the *only* server-side integrity control available. Firestore gives us a real one.

**Native TTL.** Firestore supports a server-side TTL policy on a timestamp field, free on Spark. RTDB has no equivalent — you would need a client or a Cloud Function to delete, and Cloud Functions require the Blaze plan. Given the retention requirement, this matters. (We still layer a client sweep on top; see §5.)

**Offline persistence and quota.** Firestore's `persistentLocalCache` means a reconnect resumes from a local snapshot and only pulls the delta. RTDB re-syncs more aggressively. On the Spark plan's 50k reads/day, a chatty reconnect loop is the realistic way to run out of quota, and Firestore's cache is the mitigation.

**Query model.** `orderBy('createdAt').limit(50)` with cursor pagination is native. In RTDB you would be doing `orderByChild` gymnastics and pulling more than you need.

**The honest counterargument:** RTDB has lower per-update latency (~50ms vs ~150ms for Firestore), and its `onDisconnect()` primitive is the cleanest way to implement presence — it lets the *server* mark you offline when your socket drops, which Firestore cannot do.

**Mitigation:** we use a heartbeat-plus-staleness model instead. A client writes `lastSeen` every 45s; the peer treats anything older than 90s as offline. This costs ~2 writes/minute/user (about 2,900/day against a 20k/day write budget — comfortable) and removes the need for `onDisconnect`. The typing indicator uses the same trick: we write `typingUntil = now + 5s` rather than writing "started" and "stopped", so a crashed tab can never leave a stuck indicator. This is *better* than the naive `onDisconnect` approach for our purposes, because it's self-healing.

If presence latency turns out to feel bad in Phase 4, the fallback is to add RTDB purely for the presence document while keeping messages in Firestore. Both are free. I'd rather not, though — two databases is real complexity.

---

## 2. Cryptography

### Key derivation

Both people type the **same passphrase**. PBKDF2-HMAC-SHA256, 900,000 iterations, over a 16-byte random salt stored publicly in `rooms/{id}/meta/kdf`. Output: a 256-bit AES-GCM key, created with `extractable: false` so it can never be read back out of the browser — not by an XSS payload, not by our own code.

Why PBKDF2 and not Argon2id: Argon2 is the better KDF, but there's no native Web Crypto implementation, so it means shipping a ~40 KB WASM blob and hand-rolling the memory-hard parameters. For a two-person app where the realistic attacker is "someone who found the Netlify URL", 900k PBKDF2 iterations (~800ms on a mid-range phone) is a proportionate cost. I'd revisit this in Phase 7 if you want it; the `KdfParams.v` version field exists precisely so we can migrate without breaking old messages.

**The passphrase is everything.** Say it plainly: this design has no forward secrecy and no post-compromise security. Anyone who learns the passphrase can decrypt every message they ever captured. That's the trade you accepted for zero key exchange, and it's the right trade for two people who can agree on a passphrase in person once. Practical consequence: the passphrase should be a long random phrase from a password manager, not something memorable.

### Verifying the passphrase

We can't compare hashes without weakening the scheme. Instead, `meta/kdf` stores a **key verifier**: a fixed known string encrypted under the derived key. If GCM's auth tag validates on decryption, the key is right. A wrong passphrase produces a decryption failure indistinguishable from a corrupted blob — which is what we want, because it leaks nothing.

### Message encryption

AES-256-GCM. A fresh 12-byte IV from `crypto.getRandomValues()` for **every single encryption**, no exceptions — IV reuse under a fixed key is the one mistake that catastrophically breaks GCM, so IVs are never derived, never counted, never cached.

The *entire* payload — including whether it's a text or an image — is encrypted as one blob. The server sees `{sender, createdAt, expiresAt, iv, ct}` and nothing else. Note that message *length* is still observable from ciphertext size; if that bothers you, Phase 7 can pad text messages to fixed buckets. It's cheap. Say the word.

### Images

Each image gets its own random 256-bit content key. The image is encrypted under that key; the content key is then wrapped under the conversation key and stored in the message. This costs nothing and means a future "expiring link" or per-image revocation feature doesn't require re-architecting.

---

## 6a. Images live in Firestore, not Cloud Storage

**Firebase Storage now requires the paid Blaze plan.** Since the brief specifies free-tier hosting, encrypted images are stored as Firestore documents instead.

Firestore caps a document at 1 MiB. Working backwards from that:

```
1,048,576 byte document cap
  − ~48 KB headroom for field names, timestamps, overhead
  = 1,000,000 base64 characters available
  × 3/4 (base64 inflation)
  ≈ 750,000 bytes of ciphertext
  − 12-byte IV − 16-byte GCM tag
  ≈ 749,000 bytes of image
```

We target **600 KB** for margin. At WebP quality 0.82 bounded to 1600px, that covers essentially any photograph. The client tries a quality ladder (0.82 → 0.4) until the result fits, and rejects the upload if even the lowest step doesn't.

**The honest cost:** the spec's 10 MB limit becomes "accepts up to 10 MB, compresses hard." A phone photo is visually unaffected. A screenshot of dense text will show mild artefacting. If that turns out to matter, the fallback is chunking a single image across several 1 MiB documents — it works, it's still free, but it adds chunk ordering and partial-failure cleanup, so it isn't worth doing pre-emptively.

Images go in their own `images/` subcollection rather than inline on the message document. If they were inline, every message-list snapshot would drag ~800 KB of base64 with it and the read quota would evaporate.

**EXIF:** every image is re-encoded through a canvas *regardless of size*. This is load-bearing, not an optimisation — canvas re-encoding is what strips EXIF, and phone photos carry GPS coordinates there. The original spec's "compress when appropriate" would have leaked location for any file under the threshold.

**Consequence for the deferred file-transfer feature:** arbitrary file transfer is no longer straightforward, since anything over ~750 KB needs chunking. Noted so it isn't a surprise later.

---

## 3. Device pairing

Each browser generates a random 256-bit device ID on first run, stored in IndexedDB. Only `SHA-256(deviceId)` ever reaches Firestore.

At most two `devices/{idHash}` documents may exist — enforced in Security Rules by counting the collection on create. A third browser gets *"This device is not paired."*

**Be clear about what this does and doesn't do:** pairing is an anti-nuisance control, not a security boundary. It stops a stranger who found the URL from writing junk into your conversation and burning quota. It does not protect confidentiality — that's entirely the AES key's job — and a determined attacker with the passphrase could forge a device record. The rules bind each device doc to an anonymous-auth `uid`, which raises the bar, but I don't want to oversell it.

Replacing a device (new phone) requires a successful unlock first, then deletes the old device doc.

---

## 4. Authentication

Firebase **Anonymous Auth**, purely so Security Rules have a stable `uid` to bind device records to. It is not a login. The user never sees it. The passphrase is the actual gate, and it never leaves the browser.

---

## 5. Retention — the free-tier problem

The Spark plan turns out to be more restrictive than the original plan assumed. **Three things I expected to use require billing:**

| Wanted                     | Reality                                    |
| -------------------------- | ------------------------------------------ |
| Cloud Functions (scheduled cleanup) | Blaze only                        |
| Cloud Storage (image blobs)         | Blaze only — see §6a              |
| **Firestore native TTL policies**   | **Blaze only** — confirmed by a 403 on deploy |

That last one was an error in the Phase 1 plan: I described native TTL as free. It isn't. There is no server-side garbage collector available on this project. So retention rests on two layers instead of three:

1. **Security Rules refuse to serve expired documents.** `expiresAt` in the past → permission denied, on both `messages` and `images`. This is server-enforced, instant, and cannot be bypassed by a client. It is what makes the retention guarantee real.
2. **Client-side sweep**, on connect and every 10 minutes thereafter, batch-deleting expired documents.

**Retention is 30 days**, raised from the original 24 hours (`RETENTION_MS` in config.ts, `retentionMs()` in firestore.rules — the two must agree). Day-to-day use is light enough that a month of history stays comfortably inside the free-tier quotas, and a month is far more useful to look back over. The security trade is explicit: with no forward secrecy, someone who captures ciphertext and later learns the passphrase can now decrypt 30 days of it rather than 1.

**What this actually means, stated plainly:** if neither person opens the app for a month, expired documents remain as rows in the database until someone connects. They are unreadable — rules deny them, and they are AES-256-GCM ciphertext regardless — but they are not *gone* until the next sweep.

The failure mode is bounded by the Spark storage quota (1 GiB); at ~600 KB per image that is roughly 1,700 images of accumulated garbage before writes start being refused — and Spark blocks rather than bills, so the worst case is the app declining new media until the sweep catches up, never a charge.

If genuine server-side expiry becomes important, the options are Blaze (native TTL costs nothing at this volume — you'd pay only for what exceeds the free allowances, which two users never would) or an external free-tier cron hitting a cleanup endpoint. Neither is worth doing now.

**Free-tier budget check** (Spark: 50k reads, 20k writes, 20k deletes, 1 GiB stored per day):

| Activity                     | Est. daily ops |
| ---------------------------- | -------------- |
| Presence heartbeats (2 users)| ~2,900 writes  |
| Typing (debounced to 1/2.5s) | ~500 writes    |
| Messages (200/day)           | 200 writes     |
| Read receipts                | 200 writes     |
| Message reads (cached)       | ~1,000 reads   |
| Sweep deletes                | ~400 deletes   |

Comfortable — roughly 20% of the write budget, well under 10% of reads. The heartbeat interval is the main lever if it ever gets tight.

---

## 6. Frontend

React 19 + Vite 7 + TypeScript (strict, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`) + Tailwind v4.

Tailwind v4 via `@tailwindcss/vite` — no config file, tokens live in `@theme` in `src/styles/index.css`. Colours are defined once there; no hex literals in components.

**Firebase is lazy-loaded.** The SDK is ~120 KB gzipped and dwarfs everything else, so it's split into its own chunk and only fetched after unlock. The lock screen ships as a few KB of React and paints essentially instantly — which is most of how we hit the 95+ Lighthouse target.

**Motion (`motion`, ex-Framer Motion) — reversed in the tactile-depth redesign.** The original call was "no animation library: 30 KB is not justified for CSS-length transitions." That reasoning was about the *eager* bundle. The redesign puts the animation runtime (`m` + `LazyMotion(domMax)`, ~38 KB gz) in its own `motion` chunk that only a module behind the lock screen imports — so it is never fetched until someone unlocks, and the lock screen's Lighthouse and critical path are untouched. The lock screen itself stays motion-free and CSS-only. `MotionProvider` (`src/motion/config.tsx`) sets `reducedMotion="user"`, and the global `prefers-reduced-motion` CSS block stays — a reduced-motion user gets opacity fades and no transforms. The spring vocabulary lives in `src/motion/springs.ts`; shared enter/exit variants in `src/motion/variants.ts`; the `Overlay` / `Sheet` / `Popover` primitives in `src/components/ui/` replace the hand-rolled portal-and-backdrop pattern that had been copied into a dozen files.

**Fonts:** Inter from Google Fonts with `preconnect` + `display=swap`. Phase 7 should self-host a subset — it removes a third-party origin from the CSP and kills a render-blocking request. Deferred because it's a pure optimisation.

---

## 7. Layering

```
components → hooks → services → { crypto, firebase, storage }
```

Strict, one-directional. `services/` has **no React imports** — plain TypeScript, unit-testable. `crypto/` knows nothing about Firebase; `firebase/` knows nothing about crypto. They meet only in `services/`, which is where plaintext becomes ciphertext.

The practical payoff: this is what makes the deferred features (WebRTC calling, file transfer, search) additive rather than invasive. A `transport.ts` service for WebRTC signalling slots in beside `messages.ts` without the chat UI knowing.

---

## 8. Changes to the spec — all six adopted

Confirmed 18 Jul 2026. Each is now part of the phase plan rather than a suggestion.

1. **Passphrase strength gate.** The spec doesn't set a minimum. With no forward secrecy, the passphrase is the whole system. Propose: reject anything under 12 characters, show a zxcvbn-style strength meter at setup, and recommend a generated phrase. *(Small addition to Phase 3.)*

2. **Brute-force throttling.** Nothing currently rate-limits unlock attempts. 900k PBKDF2 iterations impose ~800ms per guess, which is decent, but I'd add client-side exponential backoff after 5 failures. Note the honest limitation: an attacker who scrapes the ciphertext can brute-force offline where our throttle is irrelevant. This is another argument for a strong passphrase, not a substitute for one.

3. **Message length leaks.** Ciphertext size reveals message length. Padding text to fixed buckets (256/512/1024/4096 bytes) is nearly free. Recommend it; it's ~20 lines.

4. **Image metadata.** EXIF from a phone photo contains GPS coordinates. We must strip it during the compression step — re-encoding through a canvas does this automatically, but only if we always re-encode. Recommend re-encoding *every* image, not just ones over the 512 KB threshold.

5. **"Automatic retry after temporary disconnect"** needs an outbox. A message composed while offline should persist to IndexedDB and flush on reconnect, otherwise a backgrounded mobile tab silently drops it. Adds a `pending` delivery state (already in the type model). *(Phase 4.)*

6. **Netlify Free has no password protection.** Site-level password gating is a paid feature, so the URL is publicly reachable and the lock screen is the only barrier. Already accounted for — it's why the app looks like nothing, ships `noindex`, and denies everything by default in rules — but worth stating explicitly rather than discovering later.

---

## 8a. Device pairing, as actually implemented

Rules cannot count a collection cheaply, and they cannot verify passphrase
knowledge. Both constraints shaped the final design:

- The two device slots are **fields on the room document** (`deviceA`,
  `deviceB`), not a collection. The cap is structural — there is no third field
  to write — and a rule can check pairing with one cached `get()`.
- Slots hold the anonymous-auth `uid`. A slot may be claimed when empty, or
  released by its own occupant.
- **Replacing a device** works through a `repairUntil` window: from an
  already-paired device you open a 5-minute window, during which a new device
  may take over a slot. Rules enforce both that only a paired device can open
  the window and that it cannot exceed 5 minutes.
- **If both devices are lost**, recovery is a Firebase console operation —
  delete the room document. This is deliberate: there is no client-side path to
  wiping pairing state, because such a path is exactly what an attacker would
  use.

## 8b. A side benefit of dropping Cloud Storage

The original plan had a known soft spot: Storage rules cannot read Firestore,
so image objects could not be gated on pairing — any signed-in anonymous user
who knew an object ID could fetch its (encrypted) bytes.

Moving images into Firestore removes that entirely. Image documents sit under
`rooms/{roomId}/images/` and are covered by the same `isPaired()` check as
messages, with the same expiry check and the same write-once immutability. The
weakest link in the Phase 2 design closed itself as a consequence of the
free-tier constraint.

Firebase App Check is still worth adding in Phase 7 — it would bind all
requests to our own deployed frontend — but it is now a hardening measure
rather than a fix for a real gap.

---

## 9. Folder structure

```
.
├── public/                    favicon, manifest
├── src/
│   ├── components/
│   │   ├── ui/                Button, Input, Modal — generic primitives
│   │   ├── chat/              MessageList, Bubble, Composer  (phase 4)
│   │   └── layout/            Header, Shell                  (phase 6)
│   ├── pages/                 LockScreen, Conversation
│   ├── hooks/                 React state, orchestrates services
│   ├── services/              framework-free app logic
│   ├── crypto/                Web Crypto: derive, encrypt, decrypt
│   ├── firebase/              SDK init, path constants
│   ├── storage/               IndexedDB: device ID, outbox
│   ├── utils/                 encoding, Result, cn
│   ├── types/                 domain + wire-format types
│   ├── styles/index.css       Tailwind + design tokens
│   ├── config.ts              every tunable constant
│   ├── App.tsx
│   └── main.tsx
├── firestore.rules
├── firebase.json
├── netlify.toml
└── .env.example
```

---

## 9a. Security audit (Phase 7)

Full pass over the codebase. Findings and their resolutions:

### Fixed

**Blob MIME taken from the message payload.** `download()` built object URLs
using `payload.mime`. That payload is authenticated, but authentication only
proves it came from someone holding the key — not that its contents are safe.
A payload declaring `mime: "text/html"` would produce a `blob:` URL that
executes script **in our own origin** when opened. Every stored image is
re-encoded to WebP, so the MIME is now hardcoded and the incoming value ignored.

**Unvalidated decrypted image payloads.** `imageId` went straight into a
Firestore path. A crafted value like `../../messages/xyz` would address a
document we never intended to read. The id is now constrained to the exact
base64url shape `randomId()` produces, and width/height are bounded so an
absurd value cannot become a layout-breaking CSS aspect-ratio.

**Colour-only meaning.** Read receipts rendered accent-on-accent (invisible),
and online status was conveyed by colour alone. Both now carry meaning in
glyph and text. See §9b.

### Verified clean

- No `dangerouslySetInnerHTML`, no `innerHTML`, no `eval`. Message text is
  rendered as a React text node, which escapes it — no sanitiser needed.
- No `localStorage` or `sessionStorage`. IndexedDB only, and it holds nothing
  sensitive: an opaque device id and already-encrypted outbox envelopes.
- No secrets in tracked source. `.env.local` is gitignored; the `VITE_` values
  are public Firebase identifiers by design.
- No `console` output outside a `import.meta.env.DEV` guard.
- Four production dependencies: react, react-dom, firebase, lucide-react.
- The derived key is non-extractable and lives only in a ref, never in React
  state, never persisted.
- No error-reporting service, deliberately. Exception payloads from a messenger
  tend to contain message content.

### Accepted, with reasoning

**`style-src 'unsafe-inline'` in the CSP.** The app sets style attributes at
runtime (image aspect ratios, animation delays) and CSP nonces do not cover
inline style *attributes*, only `<style>` elements. Bounded exception: CSS
injection cannot execute script, and the only untrusted input reaching the DOM
is message text, which React escapes.

**Message document ids are client-chosen.** Rules validate document shape but
not the id format for messages. Worst case is a peer writing oddly-named
documents in their own room. Not worth a rule.

**No idle auto-lock.** The key stays in memory until the tab closes or Lock is
pressed. Adding a timeout would be easy, but it trades a real usability cost
for protection only against someone with physical access to an unlocked
machine — who has better options anyway.

## 9b. Contrast audit (Phase 6)

Measured, not eyeballed. Four pairs failed WCAG AA before the fix:

| Pair | Before | After |
| ---- | ------ | ----- |
| White on accent (every sent message) | **3.68** ✗ | 4.70 ✓ |
| Muted on background (timestamps) | **4.12** ✗ | 5.81 ✓ |
| Muted on surface | **3.67** ✗ | 5.18 ✓ |
| Muted on raised (menus) | **3.40** ✗ | 4.80 ✓ |

The significant one is the first. **The palette in the original brief was the
cause**: `#3B82F6` behind white text gives 3.68:1, and 15px body text requires
4.5:1. `--color-accent-solid: #2F6FE0` is the nearest shade that passes while
reading as the same blue. The lighter original is retained as `--color-accent`
for focus rings and icons, where it sits on the dark background at 5.41:1.

## 9c. Features added after the original brief

The brief covered messaging and images. Everything below was added afterwards
and is documented here because each one made a decision the brief did not
anticipate.

### Voice notes

Opus at 24 kbps, capped at 120 seconds, in their own `audio/` collection.
250 seconds would fit a 1 MiB document; the cap is 120 to leave headroom and
because a two-minute voice note is already long.

Amplitude peaks are sampled from an `AnalyserNode` **while recording** and
stored with the message, rather than computed afterwards by decoding the clip.
Decoding a two-minute Opus file to draw a waveform is slow enough to jank on a
phone, and sampling live also drives the recording meter for free.

### Camera capture

`getUserMedia` rather than `<input capture>`. The `capture` attribute is a
mobile-only hint that desktop browsers silently ignore, so the button would
have done nothing on a laptop. Frames are drawn to a canvas, which means they
enter the image pipeline with no EXIF to strip.

### GIFs

Search goes to Giphy — **the only outbound request in the app that is not to
Firebase**. The chosen GIF is then downloaded, encrypted, and stored like any
other image, so the recipient never contacts Giphy. Giphy can learn that
someone searched for "cat"; it cannot learn that a conversation happened, who
was in it, or when.

GIFs skip the canvas re-encode, because a canvas gives you one still frame and
the animation is the point. The cost is no metadata scrubbing for GIFs
specifically — accepted rather than shipping a GIF-rewriting library.

Favourites are stored locally and come in two kinds: a Giphy reference, or the
actual bytes for a GIF that arrived in the conversation and never had a URL.

### Voice and video calls

WebRTC, peer-to-peer, signalled through Firestore. Media never touches a
server and is DTLS-SRTP encrypted by the protocol itself.

**The signalling is encrypted too**, which is the part worth noting. SDP
offers and ICE candidates contain public and local IP addresses. Every WebRTC
tutorial writes them to the database in plaintext, which would tell Firebase
where both people are and exactly when they spoke — precisely the metadata
this app exists to avoid, leaked by the one feature nobody thinks to check.
Encrypting them reduces what the database learns to "two paired devices
exchanged some ciphertext".

STUN only, no TURN. STUN servers merely report your own public address and are
free; TURN relays media and has no free unlimited option. Roughly 10–20% of
connections will therefore fail, more behind carrier-grade NAT. That failure
is surfaced honestly rather than left spinning.

### Replies

The reply reference lives inside the encrypted payload, so no rules change was
needed. The quoted excerpt is snapshotted at send time rather than looked up
by id — the quote still renders after the original has expired and been swept,
and displaying a reply costs no extra read.

This exposed a real bug. Plain text is **padded** for length hiding, and a
padded string has nowhere to carry a reply reference, so replies on text
messages were silently dropped at encode time while replies on images worked.
There are now three payload encodings distinguished by a tag byte inside the
ciphertext: padded text, JSON media, and padded JSON text-with-reply.

### Reactions

The one place a device may write to a message it did not send — which is
exactly what the message-immutability rule existed to prevent.

What makes it safe: each participant owns one key in a `reactions` map, named
for their slot, and the rule verifies you are only touching your own. The slot
is derived from the room document, never from anything the client sends. So
the write channel is one field wide.

The value is an encrypted list, not a plain emoji. "She reacted 😭 to that
message" is content, and it would be odd to encrypt every message and leave
the emotional reaction to it in the clear. Clicking a chip your friend created
adds the emoji to *your* list — the count is computed client-side from both,
so joining a reaction never modifies their data.

### Idle auto-lock

Fifteen minutes of no pointer, keyboard, scroll or touch activity locks the
session. Deliberately not reset by incoming messages: your friend typing
should not keep your unattended laptop unlocked. Suspended during calls.

Guards against one thing — an unlocked session left where someone else can
reach it. Useless against an attacker with the passphrase or database access,
and not pretending otherwise.

## 9d. Testing

`npm test` runs a Vitest suite over the crypto layer. It exists because
encryption is the one place a silent regression is genuinely dangerous: a bug
that makes messages readable looks identical, from the UI, to one that does
not. Everything else in this app fails visibly.

The assertions are the properties the design depends on rather than line
coverage — IV uniqueness across 500 encryptions, authenticated rejection of
tampered ciphertext and tampered IVs, that padding makes "ok" and a confession
the same size, that a weakened iteration count in a tampered kdf document is
refused, and that base64 survives buffers large enough to hit the argument
limit.

Deriving a key used to require a Web Worker, which does not exist in a test
runner. Rather than skip the test, the derivation was extracted into
`derivePbkdf2` shared by both the worker and an inline fallback — one
implementation of the security-critical path, and the app now also works where
Workers are unavailable.

## 10. Phase status

| Phase | Scope                                          | Status  |
| ----- | ---------------------------------------------- | ------- |
| 1     | Architecture, scaffold, decisions              | ✅ done |
| 2     | Firebase integration, Security Rules, config   | ✅ done |
| 3     | Passphrase, device pairing, E2E encryption     | ✅ done |
| 4     | Messaging, typing, receipts, presence          | ✅ done |
| 5     | Encrypted images, compression, viewer, expiry  | ✅ done |
| 6     | UI polish, animation, a11y, mobile             | ✅ done |
| 7     | Security audit, perf, refactor, deploy         | ✅ done |

### After the brief

| Addition                                          | Status    |
| ------------------------------------------------- | --------- |
| Ambient blue redesign, premium interactions        | ✅ done   |
| Voice notes, camera capture                        | ✅ done   |
| Grouping, date separators, unread divider          | ✅ done   |
| Paste and drag-drop, emoji picker                  | ✅ done   |
| GIF search with encrypted storage                  | ✅ done   |
| Voice and video calling                            | ✅ done   |
| Replies and grouped reactions                      | ✅ done   |
| Crypto tests, self-hosted font, idle lock          | ✅ done   |
| Tactile-depth redesign + `motion` (see §6)          | ✅ done   |
| Push notifications                                 | not built |

**Hosting moved from Netlify to Firebase Hosting.** Netlify introduced a
credit system on their free tier and blocked new deploys mid-project. Firebase
Hosting is free on Spark, already authenticated, and lets `npm run deploy`
publish code and Security Rules together — which removes the failure mode
where the two drift apart. `netlify.toml` has been deleted; `firebase.json`
carries the security headers now.

**Not built: push notifications.** The remaining functional gap — without them
you only see messages while the tab is open. FCM is free on Spark, but the
notification could only say "New message", since the service worker has no key
and cannot decrypt a preview. On iOS it also requires the site be installed to
the home screen.
