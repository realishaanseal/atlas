# services/

Framework-free application logic. No React imports in this directory — these
modules are plain TypeScript so they stay unit-testable and so a future
non-React surface (a native shell, a CLI) could reuse them.

Planned:

| Module            | Phase | Responsibility                                             |
| ----------------- | ----- | ---------------------------------------------------------- |
| `session.ts`      | 3     | unlock flow: derive → verify → pair                         |
| `devices.ts`      | 3     | device identity, two-device cap, replace-a-device           |
| `messages.ts`     | 4     | send / subscribe / mark-read, encrypt+decrypt at the edges  |
| `presence.ts`     | 4     | heartbeat, typing writes, last-seen                         |
| `images.ts`       | 5     | validate → compress → encrypt → upload → fetch → decrypt    |
| `retention.ts`    | 5     | client-side sweep of expired docs and storage objects       |
| `transport.ts`    | 7     | seam for WebRTC signalling (voice/video/screen share)       |
