# Atlas

A private, end-to-end encrypted messenger for exactly two people. Runs entirely
on free-tier services — there is no way for it to cost you money.

Messages, images, GIFs, voice notes and custom emoji are encrypted in your
browser with AES-256-GCM before they touch the network. The server stores
ciphertext and nothing else. Everything except your emoji pack expires after 24
hours.

No accounts. No signup. No groups. Two devices, one shared passphrase.

---

## Contents

- [What it does](#what-it-does)
- [How it works, briefly](#how-it-works-briefly)
- [Setup — the full walkthrough](#setup--the-full-walkthrough)
  - [Step 1 — Install the tools](#step-1--install-the-tools)
  - [Step 2 — Get the code](#step-2--get-the-code)
  - [Step 3 — Create a Firebase project](#step-3--create-a-firebase-project)
  - [Step 4 — Fill in your configuration](#step-4--fill-in-your-configuration)
  - [Step 5 — Turn on anonymous sign-in](#step-5--turn-on-anonymous-sign-in)
  - [Step 6 — Deploy](#step-6--deploy)
  - [Step 7 — Authorise your domain](#step-7--authorise-your-domain)
  - [Step 8 — Choose a passphrase and claim device one](#step-8--choose-a-passphrase-and-claim-device-one)
  - [Step 9 — Connect the second person](#step-9--connect-the-second-person)
- [Optional: GIF search](#optional-gif-search)
- [Custom emoji](#custom-emoji)
- [Everyday commands](#everyday-commands)
- [Costs, honestly](#costs-honestly)
- [Security model](#security-model)
- [Troubleshooting](#troubleshooting)
- [Licence](#licence)

---

## What it does

**Messaging** — real-time, with typing indicators, read receipts, online status
and last-seen. Messages queue in an offline outbox and flush on reconnect.

**Images** — compressed, stripped of EXIF, encrypted, sent. Drag-drop, paste, or
capture from your camera. Tap for a fullscreen viewer.

**GIFs** — search Giphy, or send your own. Chosen GIFs are downloaded,
encrypted, and stored like any other image, so the recipient never contacts
Giphy. Favourites are saved locally.

**Voice notes** — up to two minutes, Opus at 24 kbps, with a waveform sampled
live while recording.

**Video** — short clips, encrypted and chunked across documents like GIFs, with
a poster frame so the bubble shows a still before the clip is fetched.

**Voice and video calls** — WebRTC, peer-to-peer. Media never touches a server,
and the signalling is encrypted too, so the database never sees an IP address.

**Replies and reactions** — swipe right on touch or hover on desktop to reply.
React with any emoji; both people's reactions group with a count. A quick-react
button applies a preset of up to ten emoji in one tap.

**Custom emoji** — upload your own, use them as `:shortcode:` in messages or as
reactions. Shared between both devices. The only thing that does not expire.

**Formatting** — a Markdown subset (`**bold**`, `*italic*`, `` `code` ``,
headings, bullets), `||spoilers||` hidden until clicked, `@mentions` that
resolve to each viewer's own names, and clickable links. `Cmd/Ctrl+B` and
`Cmd/Ctrl+I` wrap the selection.

**Pinned messages** — pin anything to a Discord-style header panel. Pins and
their media are exempted from the 24-hour sweep, so they persist.

**Editing** — edit your own messages; the original is snapshotted once so the
history always shows the true first version.

**Scheduled messages** — written to the database immediately with a future
delivery time, so they arrive whether or not the sender is online. No server
job, which the free tier could not run anyway.

**Scribble** — draw over the conversation on a translucent layer anchored to a
message, so it scrolls with the chat. Strokes are smoothed into curves and
taper with drawing speed. Shared, and expires with its anchor.

**Themes** — OKLCH-derived accent presets, an accent extracted from an uploaded
image, background tints, and a croppable wallpaper. Local to each device.

**Nicknames** — name the other person locally. Never leaves your device, with
one optional exception: a device may publish its own label so the other person
can see what they are called.

**Second device** — the A side can link a second device (phone plus laptop)
without unpairing. The cap stays structural: slots are fields on the room
document, so there is no third field to write.

**Local archive** — optionally mirror the decrypted conversation into IndexedDB
on your own device so it survives the 24-hour sweep, and export it as a single
self-contained HTML file with all media inlined.

**Lock screen** — the app presents as a generic "private workspace" until
unlocked, and auto-locks after 15 minutes idle.

---

## How it works, briefly

You and one other person share a passphrase, agreed **out of band** — in person,
or over a channel you already trust. That passphrase never leaves either
browser. It derives an encryption key locally, and that key encrypts everything
before it is sent.

Firebase stores the result. It cannot read any of it. Neither can anyone who
compromises Firebase, subpoenas Google, or steals the database — they get
ciphertext.

The two-device limit is structural: the room document has exactly two slots, so
there is no third field for a third device to claim.

---

## Setup — the full walkthrough

This assumes you have never used a terminal or Firebase. It takes about 20
minutes. Follow it in order.

### Step 1 — Install the tools

You need **Node.js version 20.19 or newer**. Check whether you already have it:

```bash
node -v
```

If that prints something like `v22.14.0`, you are set. If it says
`command not found`, download the **LTS** installer from
[nodejs.org](https://nodejs.org) and run it, then close and reopen your terminal
and check again.

> **On the terminal:** a terminal window runs one program at a time. If you
> start something like a dev server, that window belongs to it until you stop it
> with `Ctrl+C`. You can tell a window is ready for a new command because it
> shows a prompt ending in `%` or `$`. Typing a command into a window that is
> busy running something else will not work — open a new window instead.

### Step 2 — Get the code

```bash
git clone https://github.com/YOUR-USERNAME/atlas.git
cd atlas
npm install
```

`npm install` downloads the dependencies. It takes a minute or two and prints a
lot; warnings are normal, errors are not.

### Step 3 — Create a Firebase project

Firebase is Google's backend service. The free tier ("Spark") is what this
project targets, and Spark plans **block** when you hit a limit rather than
charging you. There is no card attached and no way to run up a bill.

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and
   click **Create a project**.
2. Name it anything. **Turn off Google Analytics** — it is an unnecessary
   third-party origin for a privacy tool.
3. Once created, click the **web icon** (`</>`) to add a web app. Give it any
   nickname. Do *not* tick "Firebase Hosting" here; we handle that later.
4. Firebase shows you a `firebaseConfig` block. **Leave this tab open** — you
   need those values in the next step.
5. In the left sidebar go to **Firestore Database → Create database**. Choose:
   - Edition: **Standard**
   - Database ID: `(default)`
   - Mode: **Production mode**
   - Region: whichever is nearest you. **This is permanent.**

### Step 4 — Fill in your configuration

```bash
cp .env.example .env.local
```

Open `.env.local` in any text editor and paste in the values from the
`firebaseConfig` block you left open:

| In `.env.local`                     | In `firebaseConfig`  |
| ----------------------------------- | -------------------- |
| `VITE_FIREBASE_API_KEY`             | `apiKey`             |
| `VITE_FIREBASE_AUTH_DOMAIN`         | `authDomain`         |
| `VITE_FIREBASE_PROJECT_ID`          | `projectId`          |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId`  |
| `VITE_FIREBASE_APP_ID`              | `appId`              |

Then set `VITE_ROOM_ID` to any unguessable string of your own invention — it
identifies your single conversation and appears in database paths but never in
the interface. Something like `k7m2-quiet-harbour-91x` is fine. Generate one if
you prefer:

```bash
node -e "console.log(require('crypto').randomBytes(12).toString('base64url'))"
```

> **Why these values are safe to make public.** Everything prefixed `VITE_` is
> compiled into the JavaScript that runs in the browser, so anyone visiting your
> site can read it. That is fine and expected: Firebase web config values are
> project *identifiers*, not credentials. Access control lives in the Security
> Rules; confidentiality lives in the encryption. **Never put a real secret
> behind a `VITE_` prefix.**
>
> `.env.local` is git-ignored anyway, so your values will not be committed.

### Step 5 — Turn on anonymous sign-in

In the Firebase console: **Authentication → Get started → Sign-in method →
Anonymous → Enable → Save**.

This gives each browser an opaque ID so the Security Rules can tell your two
devices apart. It involves no email, name, or personal data.

### Step 6 — Deploy

Tell Firebase which project this is, then publish:

```bash
npx firebase-tools login
npx firebase-tools use --add
```

`use --add` shows a list of your projects — pick the one you just made, and give
it the alias `default` when prompted. Then:

```bash
npm run deploy
```

That type-checks, builds, uploads the Security Rules, and publishes the site.
When it finishes it prints a **Hosting URL** like
`https://your-project.web.app`. That is your app.

> Rules and code always deploy together via `npm run deploy`. Deploying one
> without the other is how they drift apart and start rejecting valid writes.

### Step 7 — Authorise your domain

In the console: **Authentication → Settings → Authorized domains → Add domain**,
and add your hosting domain (`your-project.web.app`).

Do not skip this. Anonymous sign-in is silently refused from unlisted domains,
and the app cannot tell that apart from a slow network — it simply hangs on the
lock screen forever with no error.

### Step 8 — Choose a passphrase and claim device one

Open your Hosting URL. You will see the lock screen.

**Choose a strong passphrase.** This is the only thing protecting the
conversation, and it cannot be reset or recovered — there is no account, no
email, nobody to ask. Four or five random words is the practical sweet spot:

```bash
node -e "const w=require('crypto');console.log(Array.from({length:5},()=>w.randomInt(0,99999).toString(36)).join('-'))"
```

Or use a password manager's generator. Aim for 12 characters minimum; the app
enforces that.

Enter it and unlock. **This first unlock sets the passphrase** and claims device
slot A. There is no separate "create account" step.

### Step 9 — Connect the second person

Send the other person two things, ideally through different channels:

1. The **Hosting URL**
2. The **passphrase** — in person if you can, or via a channel you already
   trust. Not the same channel you sent the URL through, if you can avoid it.

They open the URL, enter the passphrase, and their browser claims slot B. That
is the entire pairing process. You are now connected.

**If they get "this workspace is full":** both slots are already taken — usually
because you opened the app in two browsers yourself, and each browser counts as
a device. Fix it from the device that is already in: **Settings (gear icon) →
Pair a new device**. That opens a five-minute window during which a new device
may take over a slot. Have them try again inside that window.

---

## Optional: GIF search

Without a key the GIF button is simply hidden — nothing breaks.

To enable it, get a free key at
[developers.giphy.com](https://developers.giphy.com) → **Create an App** →
choose **API**, not SDK. Put it in `.env.local` as `VITE_GIPHY_API_KEY`, then
`npm run deploy` again.

**Privacy note:** with this enabled, search terms *you type in the GIF panel* go
to Giphy. That is the only outbound request in the entire app that is not to
your own Firebase project. The GIF you pick is downloaded by you, encrypted, and
stored in Firestore like any other image — so the other person never contacts
Giphy, and Giphy never learns that a conversation happened, who was in it, or
when.

---

## Custom emoji

**Settings (gear icon) → Custom emoji.** Upload a PNG, JPEG, WebP or GIF, give
it a shortcode, and it appears for both of you.

Use one by typing `:` and a few letters in the message box — an autocomplete
appears; `Tab` or `Enter` completes it. They also show under the sparkle tab in
the emoji picker and the reaction picker.

Static images are resized to 128px and stripped of metadata. Animated GIFs are
kept byte-for-byte so the animation survives, which means they are *not* resized
and must be under 256 KB.

Emoji are the **only thing in the app that does not expire**, which is the whole
point of them. They are still encrypted, including their names — a plaintext
list of shortcodes would be a readable index of your private jokes.

---

## Everyday commands

| Command                | What it does                                  |
| ---------------------- | --------------------------------------------- |
| `npm run dev`          | Local dev server with hot reload              |
| `npm run deploy`       | Build, deploy rules, publish hosting          |
| `npm run build`        | Type-check, then production build to `dist/`  |
| `npm test`             | Crypto test suite                             |
| `npm run typecheck`    | Type-check without building                   |
| `npm run lint`         | ESLint                                        |
| `npm run rules:deploy` | Deploy Security Rules only                    |

`npm run deploy` is the one you want almost always.

---

## Costs, honestly

Everything targets the Firebase **Spark** (free) plan, which blocks rather than
bills. No card, no possible charge.

| Resource        | Free allowance   | What this app uses                          |
| --------------- | ---------------- | ------------------------------------------- |
| Firestore reads | 50,000/day       | Heavy two-person use is a few thousand      |
| Firestore writes| 20,000/day       | One per message, a few per image            |
| Firestore data  | 1 GiB            | 24h retention keeps this near zero          |
| Hosting storage | 10 GB            | ~250 KB per build                           |
| Hosting transfer| 10 GB/month      | ~250 KB gzipped per page load               |

Three Firebase features this project deliberately does **without**, because all
three require the paid Blaze plan:

- **Cloud Storage** — encrypted images live in Firestore documents instead.
- **Cloud Functions** — everything runs client-side.
- **Native TTL policies** — retention is enforced by Security Rules refusing to
  serve expired documents, plus a client-side sweep.

Calls use STUN only, no TURN, because there is no free unlimited TURN service.
Expect roughly 10–20% of calls to fail to connect, more on mobile data behind
carrier-grade NAT. That failure is surfaced honestly rather than hidden.

---

## Security model

The passphrase never leaves the browser. It derives a 256-bit AES-GCM key via
PBKDF2-SHA256 (2,000,000 iterations, public random salt) in a Web Worker, marked
non-extractable so it cannot be read back out even by code running on the page.
Every message is encrypted with a fresh random 12-byte IV. Firebase receives
only `{sender, createdAt, expiresAt, iv, ciphertext}`.

Security Rules enforce document shape, the two-device limit, and refusal to
serve expired documents — but they are a second line of defence, not the
confidentiality boundary. Even a total rules bypass yields ciphertext.

Text is padded to size buckets before encryption, so ciphertext length does not
reveal message length. Images are re-encoded through a canvas, which is what
strips EXIF — phone photos carry GPS coordinates otherwise. Call signalling is
encrypted, so the database never sees an IP address.

### Known limitations, stated plainly

- **No forward secrecy.** Anyone who learns the passphrase can decrypt any
  traffic they previously captured. Share it out-of-band exactly once.
- **Lose the passphrase and the conversation is gone.** There is no reset.
- **Deletion depends on someone opening the app.** Rules refuse expired
  documents immediately, but actual deletion happens during a client sweep.
- **Device pairing deters interference; it is not a cryptographic control.**
- **GIFs skip EXIF stripping**, because a canvas re-encode destroys the
  animation. Giphy results carry no metadata; a GIF from elsewhere might.
- **The custom-emoji count cap is client-side only.** Security Rules cannot
  cheaply count a collection. A modified client could exceed it — a storage
  concern, not a confidentiality one.
- **Search terms in the GIF panel go to Giphy.** Nothing else does.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full decision record, including
what was rejected and why.

---

## Troubleshooting

**The lock screen hangs forever after entering the passphrase.**
Almost always Step 7 — your hosting domain is not in Authentication →
Authorized domains. Anonymous sign-in is refused and the app cannot distinguish
that from a slow network.

**`zsh: command not found: firebase`**
Use `npx firebase-tools ...` instead, which fetches it on demand. Or install it
globally with `npm install -g firebase-tools`. A Node reinstall wipes global
packages, so this can appear after an upgrade.

**"Missing or insufficient permissions" in the browser console.**
The Security Rules and the deployed code are out of sync. Run `npm run deploy`,
which sends both.

**"This workspace is full."**
Both device slots are taken. Each *browser* counts as a device, so opening the
app in Chrome and Safari uses both. Free one via Settings → **Unpair this
device**, or from a device that is already in, Settings → **Pair a new device**
to open a five-minute takeover window.

**A call connects, then drops after a minute.**
Usually a NAT that STUN cannot traverse. There is no free TURN service to fall
back on. Try a different network.

**I edited the room document in the Firebase console and now nothing works.**
Deleting a field is not the same as setting it to `null` — a missing field makes
rules evaluation error, which denies everything. Recreate `deviceA` / `deviceB`
with type `null`.

---

## Licence

**Atlas Non-Commercial Licence** — © 2026 Ishaan Seal. All rights reserved.
See [LICENSE](LICENSE) for the full terms.

In short:

**You may** — run it, study it, modify it, and share it free of charge, for
personal, educational or research use. Set up your own instance for you and
someone you know; that is what it is for.

**You must** — credit Ishaan Seal as the original creator, say clearly if you
have changed it, include the licence, and pass on these same terms.

**You may not** — sell it, charge for it, use it commercially or inside a
business, host it as a paid or subscription service, monetise it through ads or
paywalls, or fold it into a closed-source product. Ask first if you want to do
any of that.

This software is provided as-is, with no warranty. It has not been
independently audited. Read the [known limitations](#known-limitations-stated-plainly)
before relying on it for anything that genuinely matters.
