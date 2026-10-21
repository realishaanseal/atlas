# storage/

Browser-local persistence. IndexedDB only — never `localStorage`, because it is
synchronous, string-only, and readable by any script on the origin.

Most of what is stored here is not sensitive: the device ID is a random opaque
value, the outbox holds *already-encrypted* envelopes, and the throttle holds a
failure count.

**The local archive is the exception.** It keeps the decrypted conversation —
text, media and the custom emoji it uses — in the clear, in its own database,
so it outlives the 30-day sweep. That is a deliberate choice: the point is a
readable keepsake, not another vault. It runs only on the A side, is on by
default, and can be paused under *Chat archive*.

| Module        | Contents                                                              |
| ------------- | --------------------------------------------------------------------- |
| `db.ts`       | thin IndexedDB wrapper for the `atlas` database (no `idb` dependency) |
| `device.ts`   | the random device ID, generated once per browser                      |
| `outbox.ts`   | encrypted messages waiting to be sent after a disconnect              |
| `throttle.ts` | failed-unlock backoff                                                 |
| `archive.ts`  | the local archive, in its own `atlas-archive` database                 |
