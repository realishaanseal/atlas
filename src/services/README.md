# services/

Framework-free application logic. No React imports in this directory — these
modules are plain TypeScript so they stay unit-testable and so a non-React
surface (a native shell, a CLI) could reuse them.

This is where `crypto/` and `firebase/` meet: the only place plaintext becomes
ciphertext and back. In `messages.ts`, for instance, plaintext exists in exactly
two places — the argument to a send and the return value of a decrypt.

| Module             | Responsibility                                                          |
| ------------------ | ----------------------------------------------------------------------- |
| `session.ts`       | the unlock flow: set up a new room, or derive → verify → claim a slot   |
| `room.ts`          | the room document: device slots, link and repair windows, the KDF read  |
| `auth.ts`          | anonymous sign-in, purely to give Security Rules a stable `uid`          |
| `messages.ts`      | send, schedule, subscribe, receipts, reactions, edits and the retention sweep |
| `presence.ts`      | heartbeat, last seen and typing                                         |
| `images.ts`        | validate → re-encode via canvas (strips EXIF) → encrypt → store, and back |
| `video.ts`         | encrypted, chunked video with a small encrypted poster frame            |
| `audio.ts`         | encrypted voice notes                                                   |
| `files.ts`         | encrypted, chunked file attachments, always downloaded as opaque bytes  |
| `gifs.ts`          | Giphy search — the only request that is not to Firebase                 |
| `calls.ts`         | WebRTC calling, with the signalling encrypted over Firestore            |
| `pins.ts`          | pinned messages: an encrypted snapshot, and an extended expiry          |
| `doodles.ts`       | encrypted doodles drawn over a message, expiring with it                |
| `emojis.ts`        | the shared custom emoji pack, which does not expire                     |
| `nicknames.ts`     | publishing and reading the encrypted nickname each side gave the other  |
| `archive.ts`       | captures the decrypted conversation into the local archive              |
| `archiveExport.ts` | renders the archive as one self-contained HTML file                     |
