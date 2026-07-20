import {
  collection,
  deleteField,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { getServices } from '@/firebase/app';
import { paths } from '@/firebase/paths';
import { MESSAGES, RETENTION_MS } from '@/config';
import { encrypt, decrypt, encryptJson, decryptJson, pad, unpad, randomId } from '@/crypto';
import type {
  DeliveryState,
  Message,
  MessageDoc,
  MessagePayload,
  ParticipantId,
  ReplyRef,
} from '@/types';
import { encodeUtf8, decodeUtf8 } from '@/utils/encoding';
import { AppError } from '@/utils/result';

/**
 * Message transport.
 *
 * Plaintext exists in exactly two places in this file: the argument to send()
 * and the return value of decryptMessage(). Everything in between, and
 * everything that touches Firestore, is ciphertext.
 */

// --- wire format -----------------------------------------------------------
//
// The payload is encrypted as one blob including its `kind`, so the server
// cannot even distinguish a text message from an image. Text is padded to a
// size bucket first so ciphertext length does not leak message length.

/**
 * Payload encodings, distinguished by a one-byte tag inside the ciphertext.
 *
 *   0 — plain text, padded to a size bucket
 *   1 — image or audio, JSON
 *   2 — text WITH a reply reference, JSON, also padded
 *
 * Tag 2 exists because of a bug worth remembering: plain text is encoded by
 * padding the string, and a padded string has nowhere to carry `replyTo`. So
 * replies on text messages were silently dropped at encode time while replies
 * on images worked, because those serialise as JSON. Text-with-reply now takes
 * the JSON path but keeps the padding, so length hiding still holds.
 */
const TAG_TEXT = 0;
const TAG_MEDIA = 1;
const TAG_TEXT_REPLY = 2;

async function encryptPayload(key: CryptoKey, payload: MessagePayload) {
  let tag: number;
  let bytes: Uint8Array;

  if (payload.kind === 'text' && payload.replyTo) {
    tag = TAG_TEXT_REPLY;
    bytes = pad(JSON.stringify(payload));
  } else if (payload.kind === 'text') {
    tag = TAG_TEXT;
    bytes = pad(payload.text);
  } else {
    tag = TAG_MEDIA;
    bytes = encodeUtf8(JSON.stringify(payload));
  }

  const tagged = new Uint8Array(bytes.length + 1);
  tagged[0] = tag;
  tagged.set(bytes, 1);

  return encrypt(key, tagged);
}

/**
 * Validates a decrypted image payload before it is used.
 *
 * SECURITY: successful decryption proves the payload came from someone holding
 * the conversation key. It does NOT prove the contents are well-formed. A
 * crafted `imageId` such as `../../messages/xyz` would be concatenated into a
 * Firestore path and could address a document we never intended to read.
 *
 * So the id is constrained to the exact base64url shape randomId() produces,
 * and the numeric fields are bounded — an absurd width/height would otherwise
 * become a CSS aspect-ratio that blows up the layout.
 */
const ID_PATTERN = /^[A-Za-z0-9_-]{22,64}$/;

function isBounded(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max;
}

function isValidImagePayload(value: unknown): value is Extract<MessagePayload, { kind: 'image' }> {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;

  return (
    p['kind'] === 'image' &&
    typeof p['imageId'] === 'string' &&
    ID_PATTERN.test(p['imageId']) &&
    isBounded(p['width'], 10000) &&
    isBounded(p['height'], 10000) &&
    // Bounded so a crafted payload cannot make us issue hundreds of reads
    // chasing chunks that do not exist.
    (p['chunks'] === undefined || isBounded(p['chunks'], 16)) &&
    typeof p['wrappedKey'] === 'object' &&
    p['wrappedKey'] !== null
  );
}

function isValidCallPayload(value: unknown): value is Extract<MessagePayload, { kind: 'call' }> {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;

  return (
    p['kind'] === 'call' &&
    (p['callKind'] === 'audio' || p['callKind'] === 'video') &&
    (p['outcome'] === 'completed' || p['outcome'] === 'missed' || p['outcome'] === 'declined') &&
    // A call cannot last longer than a day; anything else is nonsense.
    (p['durationMs'] === undefined || isBounded(p['durationMs'], 86_400_000))
  );
}

function isValidAudioPayload(value: unknown): value is Extract<MessagePayload, { kind: 'audio' }> {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;

  return (
    p['kind'] === 'audio' &&
    typeof p['audioId'] === 'string' &&
    ID_PATTERN.test(p['audioId']) &&
    // A little over the 120s cap, to tolerate timer drift.
    isBounded(p['durationMs'], 130_000) &&
    typeof p['mime'] === 'string' &&
    p['mime'].length <= 64 &&
    Array.isArray(p['peaks']) &&
    p['peaks'].length <= 128 &&
    p['peaks'].every((peak) => typeof peak === 'number' && Number.isFinite(peak)) &&
    typeof p['wrappedKey'] === 'object' &&
    p['wrappedKey'] !== null
  );
}

export const MAX_REACTIONS_PER_PERSON = 6;

/**
 * A reaction is either a literal Unicode emoji or a custom emoji reference.
 *
 * Both forms are bounded, which is the point of checking at all: this value is
 * authored by the peer, and "decrypted successfully" only means it came from
 * whoever holds the key — not that it is something we should render.
 *
 * The custom form has to be matched explicitly rather than covered by a longer
 * length limit. `custom:` plus a 22-character document id is ~29 characters,
 * so simply raising the cap to fit it would also admit a 29-character "emoji",
 * which is exactly what the original bound existed to prevent. Matching the id
 * grammar keeps the field narrow.
 */
const CUSTOM_REACTION = /^custom:[A-Za-z0-9_-]{22,64}$/;

function isValidReaction(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  // A Unicode emoji, including multi-codepoint sequences like flags and ZWJ
  // families, fits comfortably in 8 UTF-16 units.
  if (value.length <= 8) return true;
  return CUSTOM_REACTION.test(value);
}

/**
 * Reactions decrypt independently — one bad entry must not lose the others.
 *
 * Accepts both a bare string and an array, because messages written before
 * reactions became multi-valued hold a single emoji. Normalising here means
 * the rest of the app only ever sees arrays.
 */
async function decryptReactions(
  key: CryptoKey,
  reactions: MessageDoc['reactions'],
): Promise<Partial<Record<ParticipantId, string[]>>> {
  if (!reactions) return {};

  const out: Partial<Record<ParticipantId, string[]>> = {};
  for (const slot of ['a', 'b'] as const) {
    const envelope = reactions[slot];
    if (!envelope) continue;
    try {
      const decoded = await decryptJson<unknown>(key, envelope);
      const list = typeof decoded === 'string' ? [decoded] : decoded;
      if (!Array.isArray(list)) continue;

      // Bound both the count and each entry — a "reaction" is one or two
      // characters, not a payload smuggled in through a small field.
      const clean = list
        .filter(isValidReaction)
        .slice(0, MAX_REACTIONS_PER_PERSON);

      if (clean.length > 0) out[slot] = clean;
    } catch {
      // Skip an undecryptable reaction rather than dropping the message.
    }
  }
  return out;
}

/** Bounds a reply reference authored by the peer. */
function sanitiseReply(value: unknown): ReplyRef | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const r = value as Record<string, unknown>;

  if (typeof r['id'] !== 'string' || !ID_PATTERN.test(r['id'])) return undefined;
  if (r['sender'] !== 'a' && r['sender'] !== 'b') return undefined;
  if (r['kind'] !== 'text' && r['kind'] !== 'image' && r['kind'] !== 'audio') return undefined;
  if (typeof r['preview'] !== 'string') return undefined;

  return {
    id: r['id'],
    sender: r['sender'],
    kind: r['kind'],
    preview: r['preview'].slice(0, 200),
  };
}

async function decryptPayload(key: CryptoKey, doc: MessageDoc): Promise<MessagePayload> {
  const tagged = await decrypt(key, doc.body);
  const tag = tagged[0];
  const body = tagged.subarray(1);

  if (tag === TAG_TEXT) return { kind: 'text', text: unpad(body) };

  if (tag === TAG_TEXT_REPLY) {
    const parsed: unknown = JSON.parse(unpad(body));
    if (typeof parsed !== 'object' || parsed === null) throw new AppError('decrypt-failed');
    const p = parsed as Record<string, unknown>;
    if (p['kind'] !== 'text' || typeof p['text'] !== 'string') {
      throw new AppError('decrypt-failed');
    }
    const replyTo = sanitiseReply(p['replyTo']);
    return { kind: 'text', text: p['text'], ...(replyTo ? { replyTo } : {}) };
  }

  const parsed: unknown = JSON.parse(decodeUtf8(body));
  if (isValidCallPayload(parsed)) return parsed;
  if (isValidImagePayload(parsed) || isValidAudioPayload(parsed)) {
    const replyTo = sanitiseReply((parsed as Record<string, unknown>)['replyTo']);
    return { ...parsed, ...(replyTo ? { replyTo } : {}) };
  }
  throw new AppError('decrypt-failed');
}

// --- sending ---------------------------------------------------------------

export interface PendingSend {
  readonly id: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly body: Awaited<ReturnType<typeof encrypt>>;
}

/** Encrypts without writing. Lets the outbox hold a message safely offline. */
export async function prepare(
  key: CryptoKey,
  payload: MessagePayload,
): Promise<PendingSend> {
  const createdAt = Date.now();
  return {
    id: randomId(),
    createdAt,
    expiresAt: createdAt + RETENTION_MS,
    body: await encryptPayload(key, payload),
  };
}

export async function commit(pending: PendingSend, sender: ParticipantId): Promise<void> {
  const { db } = getServices();
  await setDoc(doc(db, paths.message(pending.id)), {
    sender,
    createdAt: pending.createdAt,
    expiresAt: pending.expiresAt,
    body: pending.body,
  });
}

// --- receiving -------------------------------------------------------------

export interface MessageStream {
  readonly messages: Message[];
  readonly fromCache: boolean;
}

/**
 * Subscribes to the live message list.
 *
 * The `where('expiresAt', '>', ...)` clause is REQUIRED, not an optimisation.
 * Security Rules deny reads of expired documents, and Firestore rejects an
 * entire query if any matched document would fail the rule. Without this
 * filter the query fails wholesale the moment one message ages out.
 *
 * Ordering by expiresAt rather than createdAt is deliberate: Firestore
 * requires the first orderBy to match the inequality field, and since
 * expiresAt is always createdAt + 24h the two orderings are identical.
 */
export function subscribe(
  key: CryptoKey,
  onUpdate: (stream: MessageStream) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const { db } = getServices();

  // No expiry filter here — see the `list` rule in firestore.rules for why.
  // A range filter is frozen at subscription time, so a document expiring
  // mid-session would fail a strict rule and tear down the whole listener.
  // Expired documents are filtered below instead.
  const q = query(
    collection(db, paths.messages()),
    orderBy('createdAt', 'desc'),
    limit(MESSAGES.PAGE_SIZE),
  );

  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snapshot) => {
      void (async () => {
        const now = Date.now();
        const live = snapshot.docs.filter((snap) => (snap.data() as MessageDoc).expiresAt > now);

        const decrypted = await Promise.all(
          live.map(async (snap): Promise<Message | null> => {
            const data = snap.data() as MessageDoc;
            try {
              return {
                id: snap.id,
                sender: data.sender,
                createdAt: data.createdAt,
                expiresAt: data.expiresAt,
                payload: await decryptPayload(key, data),
                reactions: await decryptReactions(key, data.reactions),
                state: (data.readAt !== undefined ? 'read' : 'delivered') satisfies DeliveryState,
                ...(data.readAt !== undefined ? { readAt: data.readAt } : {}),
              };
            } catch {
              // A message we cannot decrypt is not a crash. It most likely
              // predates a key change. Drop it rather than breaking the list.
              return null;
            }
          }),
        );

        onUpdate({
          messages: decrypted.filter((m): m is Message => m !== null).reverse(),
          fromCache: snapshot.metadata.fromCache,
        });
      })();
    },
    onError,
  );
}

/** Recipient stamps readAt. Rules enforce that only the non-sender may. */
export async function markRead(messageId: string): Promise<void> {
  const { db } = getServices();
  await updateDoc(doc(db, paths.message(messageId)), { readAt: Date.now() });
}

/**
 * Sets or clears our own reaction on a message.
 *
 * Each participant owns exactly one key in the `reactions` map, and rules
 * enforce that you may only touch your own. That constraint is what makes it
 * safe to let someone write to a message they did not send — without it,
 * "allow reactions" would be "allow arbitrary edits to your peer's messages".
 */
export async function react(
  key: CryptoKey,
  messageId: string,
  slot: ParticipantId,
  emoji: string[],
): Promise<void> {
  const { db } = getServices();
  const field = `reactions.${slot}`;

  await updateDoc(
    doc(db, paths.message(messageId)),
    emoji.length === 0
      ? { [field]: deleteField() }
      : { [field]: await encryptJson(key, emoji.slice(0, MAX_REACTIONS_PER_PERSON)) },
  );
}

/**
 * Retention sweep.
 *
 * Firestore's native TTL requires the paid Blaze plan, so deletion is the
 * client's job. Rules permit deleting only already-expired documents, so a
 * buggy or hostile client cannot use this to destroy live messages.
 *
 * All three collections are swept, not just messages. Images and voice clips
 * live in their own collections precisely so the message stream stays light —
 * but that means deleting a message does NOT delete its media, and sweeping
 * only messages would leave the heavy documents behind forever. Since media is
 * what actually consumes the 1 GiB storage quota, that would have been the
 * failure that eventually broke the app.
 *
 * Bounded per run: a large backlog clears over several passes rather than
 * firing hundreds of deletes at once.
 */
async function sweepCollection(path: string, cap: number): Promise<number> {
  const { db } = getServices();

  const expired = await getDocs(
    query(
      collection(db, path),
      where('expiresAt', '<=', Date.now()),
      orderBy('expiresAt'),
      limit(cap),
    ),
  );

  if (expired.empty) return 0;

  const batch = writeBatch(db);
  for (const snap of expired.docs) batch.delete(snap.ref);
  await batch.commit();

  return expired.size;
}

export async function sweep(): Promise<number> {
  // Media first — those documents are ~800 KB each, so they are what the
  // storage quota actually cares about. Messages are a rounding error.
  const results = await Promise.allSettled([
    sweepCollection(paths.images(), 20),
    sweepCollection(paths.audioClips(), 20),
    sweepCollection(paths.messages(), 100),
  ]);

  return results.reduce(
    (total, result) => total + (result.status === 'fulfilled' ? result.value : 0),
    0,
  );
}
