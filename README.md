# Atlas

A private, end-to-end encrypted workspace for exactly two people.

Messages, images, GIFs and voice notes are encrypted in the browser with
AES-256-GCM before they touch the network. The server stores ciphertext and
nothing else. Everything expires after 30 days.

---

## What it does

**Messaging** — real-time, with typing indicators, read receipts, online
status and last-seen. Messages queue in an offline outbox and flush on
reconnect.

**Images** — compressed, stripped of EXIF, encrypted, sent. Drag-drop, paste,
or capture from your camera. Tap for a fullscreen viewer.

**GIFs** — search Giphy, or send your own. Picked GIFs are downloaded,
encrypted, and stored like any other image, so the recipient never contacts
Giphy. Favourites are saved locally, including GIFs from the conversation.

**Voice notes** — up to two minutes, Opus at 24 kbps, with a waveform sampled
live while recording.

**Voice and video calls** — WebRTC, peer-to-peer. Media never touches a server,
and the signalling is encrypted too, so the database never sees an IP address.

**Replies and reactions** — swipe right on touch or hover on desktop to reply.
React with any emoji; both people's reactions group with a count.

**Two devices only.** No accounts, no signup, no groups.

---

## Requirements

- Node.js 20.19+ (or 22.12+)
- A Firebase project on the free Spark plan
- Optionally, a free Giphy API key for GIF search

## Quick start

```bash
npm install
cp .env.example .env.local     # then fill in your Firebase config
npm run dev
```

Open http://localhost:5173.

## Commands

| Command             | What it does                                          |
| ------------------- | ----------------------------------------------------- |
| `npm run dev`       | Dev server with HMR                                   |
| `npm run deploy`    | Build, deploy Security Rules, publish hosting         |
| `npm run build`     | Type-check, then production build to `dist/`          |
| `npm test`          | Crypto test suite                                     |
| `npm run typecheck` | Type-check without emitting                           |
| `npm run lint`      | ESLint                                                |
| `npm run rules:deploy` | Deploy Security Rules only                         |

`npm run deploy` is the one you want. Rules and code go out together, which
stops them drifting apart.

---

## Firebase setup

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com). Disable Google Analytics — it's an unnecessary third-party origin.
2. Add a **Web app**; copy the config values into `.env.local`.
3. **Firestore Database → Create database.** *Standard edition*, database ID `(default)`, *production mode*, region nearest you. The region is permanent.
4. **Authentication → Get started → Sign-in method → Anonymous → Enable.**
5. Deploy and publish:
   ```bash
   npm run deploy
   ```
6. **Authentication → Settings → Authorized domains** → add your hosting domain (`your-project.web.app`). Anonymous sign-in is refused from unlisted domains, and the app cannot distinguish that from a slow network — it just hangs.

> **Three Firebase features this project deliberately does without**, because
> all three require the paid Blaze plan: Cloud Storage (encrypted images live
> in Firestore documents instead), Cloud Functions, and native TTL policies.
> Retention is enforced by Security Rules refusing to serve expired documents,
> plus a client-side sweep. See ARCHITECTURE.md §5 for what that does and
> doesn't guarantee.

### Environment variables

All `VITE_`-prefixed values are inlined into the client bundle and are
therefore **public**. That is fine and expected — Firebase web config values
are project identifiers, not credentials. Access control lives in Security
Rules; confidentiality lives in the client-side encryption. Never put a real
secret behind a `VITE_` prefix.

| Variable                            | Required | Where to find it                     |
| ----------------------------------- | -------- | ------------------------------------ |
| `VITE_FIREBASE_API_KEY`             | yes      | Project settings → Your apps         |
| `VITE_FIREBASE_AUTH_DOMAIN`         | yes      | ″                                    |
| `VITE_FIREBASE_PROJECT_ID`          | yes      | ″                                    |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | yes      | ″                                    |
| `VITE_FIREBASE_APP_ID`              | yes      | ″                                    |
| `VITE_ROOM_ID`                      | yes      | You choose. Any unguessable string.  |
| `VITE_GIPHY_API_KEY`                | no       | developers.giphy.com → Create an App |

Without a Giphy key the GIF button is hidden rather than broken.

---

## Deployment

`npm run deploy` builds, deploys Security Rules, and publishes to Firebase
Hosting in one step. Your site is at `<project-id>.web.app`.

Hosting is free on Spark: 10 GB storage, 10 GB/month transfer. The app is
~250 KB gzipped per load and media goes through Firestore rather than Hosting,
so that is roughly 40,000 page loads a month.

Quotas on Spark **block** rather than bill. There is no card attached and no
way to run up a charge.

---

## Security model

The passphrase never leaves the browser. It derives a 256-bit AES-GCM key via
PBKDF2-SHA256 (2,000,000 iterations, public random salt) in a Web Worker,
marked non-extractable so it cannot be read back out even by code running on
the page. Every message is encrypted with a fresh random 12-byte IV. Firebase
receives only `{sender, createdAt, expiresAt, iv, ciphertext}`.

Security Rules enforce document shape, the two-device limit, and refusal to
serve expired documents — but they are a second line of defence, not the
confidentiality boundary. Even a total rules bypass yields ciphertext.

Text is padded to size buckets before encryption, so ciphertext length does
not reveal message length. Images are re-encoded through a canvas, which is
what strips EXIF — phone photos carry GPS coordinates otherwise. Call
signalling is encrypted, so the database never sees an IP address.

**Known limitations, stated plainly:**

- **No forward secrecy.** Anyone who learns the passphrase can decrypt any
  traffic they previously captured. Use a long generated passphrase and share
  it out-of-band exactly once.
- **Deletion depends on someone opening the app.** Rules refuse expired
  documents immediately, but actual deletion happens during a client sweep.
- **Device pairing deters interference; it is not a cryptographic control.**
- **GIFs skip EXIF stripping**, because a canvas re-encode would destroy the
  animation. Giphy results carry no metadata; a GIF from elsewhere might.
- **Search terms in the GIF panel go to Giphy.** Nothing else does.

See ARCHITECTURE.md for the full decision record.
