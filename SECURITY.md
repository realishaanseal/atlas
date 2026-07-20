# Security

## Status of this project

Atlas is a personal project. It has **not been independently audited**. It uses
standard primitives in standard ways — AES-256-GCM, PBKDF2-HMAC-SHA256, the Web
Crypto API — but "uses good primitives" and "is secure" are different claims,
and only the first one is being made here.

Do not use it for anything where being wrong about that would seriously harm
you.

## What it protects against

- **The server operator.** Firebase stores ciphertext. Google cannot read your
  messages, and neither can anyone who compromises the project, obtains a
  subpoena, or steals the database.
- **Network observers.** Everything is encrypted before it leaves the browser,
  on top of TLS.
- **Casual access to an unlocked device**, via the lock screen and a 15-minute
  idle auto-lock.

## What it does not protect against

- **A compromised endpoint.** Malware, a malicious browser extension, or someone
  with your unlocked device sees plaintext. Nothing here can prevent that.
- **A leaked passphrase.** There is no forward secrecy. Anyone who learns the
  passphrase can decrypt any traffic they previously captured, including
  messages sent before the leak.
- **Traffic analysis.** Message contents and lengths are hidden (text is padded
  to size buckets), but the existence and timing of messages is visible to
  anyone with database access.
- **A hostile peer.** The other person can screenshot, record, or simply
  remember anything you send. This is true of every messenger.
- **Malicious modification of your own deployment.** If someone can change the
  JavaScript you serve, they can exfiltrate your key. Deploy from a machine you
  control.

## Reporting a vulnerability

Open a GitHub issue for anything low-risk. For something that could compromise
users, contact the maintainer privately first rather than filing publicly.

Please include what you did, what happened, and what you expected. A proof of
concept is welcome but not required.

## Deliberate design decisions that look like bugs

These are documented in full in `ARCHITECTURE.md`, but come up often enough to
list here:

- **Firebase config values are public.** They are project identifiers, not
  credentials. Access control lives in Security Rules; confidentiality lives in
  the encryption layer.
- **Message queries do not check expiry.** A live listener's range filter is
  fixed at subscription time, so rejecting expired documents mid-stream would
  tear down the whole listener. Direct reads do check. See `firestore.rules`.
- **GIFs are not EXIF-stripped.** A canvas re-encode destroys animation. The
  trade is documented at the call site.
- **The custom-emoji count cap is client-side only.** Security Rules cannot
  cheaply count a collection. The exposure is storage quota, not
  confidentiality.
- **Calls are STUN-only.** There is no free unlimited TURN service, so some
  calls will fail to connect rather than falling back to a relay.
