# hooks/

React-facing state. Hooks orchestrate services; they never talk to Firebase and
never encrypt or decrypt — that happens in `services/`, which is the only place
plaintext becomes ciphertext. That boundary is what let calls, files and video
arrive beside messaging without the chat UI changing.

Shared state that many components read — the custom emoji pack, mention names,
the theme — is a context provider rather than a plain hook. Independent hook
instances each hold their own state, and two of them never agree.

| Hook                      | Responsibility                                                         |
| ------------------------- | ---------------------------------------------------------------------- |
| `useSession`              | setup / locked / unlocking / unlocked / unpaired state machine; holds the key in a ref |
| `useMessages`             | message stream, optimistic sends through the outbox, delivery and read receipts |
| `usePresence`             | online, last seen and typing — read and write                          |
| `useCall`                 | call state machine: placing, answering, streams, hang-up               |
| `useAudioBoost`           | amplifies a remote call stream past 100% through a Web Audio gain node |
| `useRecorder`             | microphone recording with live level metering for voice notes          |
| `useImage`                | decrypts an image for display; revokes its object URL on unmount      |
| `useVideo`                | decrypts a video's poster at once and the clip only on demand          |
| `usePins`                 | the shared pin list and the pinned messages themselves                 |
| `useDoodles`              | the shared doodle layer drawn over messages                            |
| `useCustomEmoji`          | context: the shared, encrypted custom emoji pack                       |
| `useMentionNames`         | context: the names used to render and complete mentions                |
| `useTheme`                | context: accent and background theme, stored on this device            |
| `usePeerName`             | the on-device nickname for the other person                            |
| `useNicknameSync`         | what the other person calls you, read from their encrypted nickname    |
| `useArchive`              | mirrors the decrypted conversation into the local archive (A side only) |
| `useUnreadNotifications`  | in-tab notifications, the unread count and the alert sound            |
| `useNotificationSettings` | the notification preferences behind that                               |
| `useEmojiFavourites`      | favourite emoji, on this device                                        |
| `useGifFavourites`        | saved GIFs, on this device — Giphy references or the bytes themselves  |
| `useBulkReactions`        | the personal quick-react preset                                        |
| `useSwipeToReply`         | the swipe-right-to-reply gesture on touch                              |
| `useAutoScroll`           | sticky-bottom scrolling that respects a manual scroll-up               |
| `useBackGuard`            | makes Android's back gesture close overlays instead of leaving the app |
| `useIdleLock`             | locks the session after 15 minutes without activity                    |
