# storage/

Browser-local persistence. IndexedDB only — never `localStorage`, because it is
synchronous, string-only, and readable by any script on the origin.

Nothing in here is ever encrypted-at-rest by us beyond what the browser
provides, so nothing sensitive is stored: the device ID is a random opaque
value, and the outbox holds *already-encrypted* envelopes, not plaintext.

Planned:

| Module       | Phase | Contents                                              |
| ------------ | ----- | ----------------------------------------------------- |
| `device.ts`  | 3     | the random device ID, generated once per browser      |
| `outbox.ts`  | 4     | encrypted messages awaiting send after a disconnect   |
| `db.ts`      | 3     | thin IndexedDB wrapper (no `idb` dependency needed)   |
