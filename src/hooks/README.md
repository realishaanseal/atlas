# hooks/

React-facing state. Hooks orchestrate services; they never talk to Firebase or
the Web Crypto API directly. That boundary is what will let voice/video be
added later without touching the messaging UI.

Planned:

| Hook               | Phase | Responsibility                                          |
| ------------------ | ----- | ------------------------------------------------------- |
| `useSession`       | 3     | locked / deriving / unlocked / unpaired state machine    |
| `useMessages`      | 4     | subscribes to the message stream, decrypts, paginates    |
| `usePresence`      | 4     | online, last seen, typing — read and write               |
| `useConnection`    | 4     | connection state + exponential-backoff reconnect         |
| `useImageUpload`   | 5     | compress, encrypt, upload, progress                      |
| `useAutoScroll`    | 6     | sticky-bottom scrolling that respects manual scroll-up   |
| `useMediaQuery`    | 6     | responsive + `prefers-reduced-motion`                    |
