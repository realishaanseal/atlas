import { ROOM_ID } from '@/config';

/**
 * Every Firestore and Storage path is constructed here.
 *
 * Centralising paths means the Security Rules and the client can be reviewed
 * against one short list. Anything not listed below is denied by default.
 *
 *   rooms/{roomId}                  — singleton; holds the two device slots
 *   rooms/{roomId}/meta/kdf         — public KDF params + key verifier
 *   rooms/{roomId}/messages/{id}    — encrypted messages
 *   rooms/{roomId}/presence/{a|b}   — online / lastSeen / typing
 *   rooms/{roomId}/images/{id}      — encrypted image bytes, one doc per image
 *   rooms/{roomId}/emojis/{id}      — custom emoji; the ONE collection with no
 *                                     expiry, since a pack that vanished every
 *                                     24 hours would be pointless
 *
 * Images live in Firestore rather than Cloud Storage because Storage requires
 * the paid Blaze plan. Keeping them in a separate collection (rather than
 * inline on the message) means the message list can be subscribed to cheaply
 * without dragging ~800 KB of base64 along with every snapshot.
 *
 * Note there is no `devices` collection. The two device slots live as two
 * fields on the room document instead, which makes the "exactly two devices"
 * cap structural rather than something rules have to count, and lets a rule
 * check pairing with a single cached get().
 */

export const paths = {
  room: () => `rooms/${ROOM_ID}`,
  kdf: () => `rooms/${ROOM_ID}/meta/kdf`,
  messages: () => `rooms/${ROOM_ID}/messages`,
  message: (id: string) => `rooms/${ROOM_ID}/messages/${id}`,
  presence: (slot: 'a' | 'b') => `rooms/${ROOM_ID}/presence/${slot}`,
  images: () => `rooms/${ROOM_ID}/images`,
  image: (id: string) => `rooms/${ROOM_ID}/images/${id}`,
  audioClips: () => `rooms/${ROOM_ID}/audio`,
  audioClip: (id: string) => `rooms/${ROOM_ID}/audio/${id}`,
  emojis: () => `rooms/${ROOM_ID}/emojis`,
  emoji: (id: string) => `rooms/${ROOM_ID}/emojis/${id}`,
  calls: () => `rooms/${ROOM_ID}/calls`,
  call: (id: string) => `rooms/${ROOM_ID}/calls/${id}`,
  callCandidates: (id: string, side: 'caller' | 'callee') =>
    `rooms/${ROOM_ID}/calls/${id}/${side}Candidates`,
} as const;
