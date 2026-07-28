import { collection, deleteDoc, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { getServices } from '@/firebase/app';
import { paths } from '@/firebase/paths';
import { PINS, RETENTION_MS } from '@/config';
import { encryptJson, decryptJson } from '@/crypto';
import { maskSpoilers } from '@/utils/spoiler';
import type { Message, Pin, PinDoc, PinMediaRef, PinSnapshot } from '@/types';

/**
 * Pinned messages, persisted.
 *
 * A pin does two things. It writes a `pins/{messageId}` document holding an
 * encrypted snapshot of the message, so the pin list always has something to
 * show. And it pushes the message's own `expiresAt` (and its media documents')
 * far into the future, so the retention sweep leaves it alone — the message
 * stays in the timeline, in order, and jumpable until unpinned.
 *
 * Unpinning reverses both: delete the pin document, then restore the message
 * and its media to a normal 24h-from-creation expiry, so an old one is swept on
 * the next pass. Order matters — the pin document must exist for the message
 * rule to permit the far-future expiry, and must be gone for it to permit the
 * restore. See the message `allow update` branch in firestore.rules.
 */

/** The media a message depends on, as ids for later expiry changes. */
export function mediaRef(message: Message): PinMediaRef | undefined {
  if (message.payload.kind === 'image') {
    return {
      kind: 'image',
      id: message.payload.imageId,
      ...(message.payload.chunks && message.payload.chunks > 1
        ? { chunks: message.payload.chunks }
        : {}),
    };
  }
  if (message.payload.kind === 'video') {
    return {
      kind: 'video',
      id: message.payload.videoId,
      ...(message.payload.chunks && message.payload.chunks > 1
        ? { chunks: message.payload.chunks }
        : {}),
    };
  }
  if (message.payload.kind === 'audio') {
    return { kind: 'audio', id: message.payload.audioId };
  }
  return undefined;
}

/** Every document id a media ref covers — image and video may be chunked. */
function mediaDocPaths(media: PinMediaRef): string[] {
  if (media.kind === 'audio') return [paths.audioClip(media.id)];
  const at = media.kind === 'video' ? paths.video : paths.image;
  const chunks = media.chunks ?? 1;
  if (chunks <= 1) return [at(media.id)];
  return Array.from({ length: chunks }, (_, index) => at(`${media.id}-c${String(index)}`));
}

/** Sets expiresAt on every document a media ref covers, best-effort per doc. */
async function setMediaExpiry(media: PinMediaRef, expiresAt: number): Promise<void> {
  const { db } = getServices();
  await Promise.all(
    mediaDocPaths(media).map(async (path) => {
      try {
        await updateDoc(doc(db, path), { expiresAt });
      } catch {
        // A missing or already-swept chunk is not worth failing the pin over.
      }
    }),
  );
}

function previewFor(message: Message): { preview: string; text?: string } {
  switch (message.payload.kind) {
    case 'text': {
      const text = message.payload.text.slice(0, PINS.MAX_TEXT);
      // The full text is kept for the message; the panel preview is masked so a
      // pinned spoiler is not revealed in the list.
      return { text, preview: maskSpoilers(text).slice(0, PINS.PREVIEW_LENGTH) };
    }
    case 'image':
      return { preview: message.payload.mime === 'image/gif' ? 'GIF' : 'Photo' };
    case 'video':
      return { preview: 'Video' };
    case 'audio':
      return { preview: 'Voice message' };
    case 'call':
      return { preview: 'Call' };
  }
}

export async function pin(key: CryptoKey, message: Message): Promise<void> {
  const { preview, text } = previewFor(message);
  const media = mediaRef(message);

  const snapshot: PinSnapshot = {
    sender: message.sender,
    kind: message.payload.kind,
    createdAt: message.createdAt,
    preview,
    ...(text !== undefined ? { text } : {}),
    ...(media ? { media } : {}),
  };

  const document: PinDoc = {
    owner: getServices().auth.currentUser?.uid ?? '',
    pinnedAt: Date.now(),
    snapshot: await encryptJson(key, snapshot),
  };

  const { db } = getServices();

  // Pin document first: the message rule only permits the far-future expiry
  // while this exists.
  await setDoc(doc(db, paths.pin(message.id)), document);

  await keepAlive(message);
}

/**
 * Pushes a pinned message (and its media) out to the keep-until sentinel so the
 * sweep skips it and reads of it are never refused as expired.
 *
 * Split out from `pin` so it can be re-applied as a self-heal: if the extension
 * ever failed — a transient error, or a client that pinned before the rules
 * allowing it were deployed — the next load runs this again while the message
 * is still alive, and it sticks. A message that already expired and was swept
 * cannot be recovered; this only prevents future loss.
 */
export async function keepAlive(message: Message): Promise<void> {
  const { db } = getServices();
  const media = mediaRef(message);
  await updateDoc(doc(db, paths.message(message.id)), { expiresAt: PINS.KEEP_UNTIL });
  if (media) await setMediaExpiry(media, PINS.KEEP_UNTIL);
}

/**
 * Unpins, restoring normal expiry.
 *
 * Takes the message's createdAt and media ref rather than fetching them, so a
 * pin can be removed from the panel without the message being on screen. The
 * restore value is createdAt + 24h; if that is already past, the sweep collects
 * it next pass.
 */
export async function unpin(input: {
  messageId: string;
  createdAt: number;
  media?: PinMediaRef;
}): Promise<void> {
  const { db } = getServices();
  const restore = input.createdAt + RETENTION_MS;

  // Delete the pin first: the message rule only permits the restore while no
  // pin exists.
  await deleteDoc(doc(db, paths.pin(input.messageId)));

  try {
    await updateDoc(doc(db, paths.message(input.messageId)), { expiresAt: restore });
  } catch {
    // The message may already be gone; nothing to restore.
  }
  if (input.media) await setMediaExpiry(input.media, restore);
}

/**
 * Live subscription to the pin list.
 *
 * A malformed snapshot is dropped rather than allowed to blank the panel —
 * "decrypted" proves origin, not shape, and a peer on a modified client could
 * write something odd.
 */
export function subscribe(key: CryptoKey, onUpdate: (pins: Pin[]) => void): () => void {
  const { db } = getServices();

  return onSnapshot(collection(db, paths.pins()), (snap) => {
    void (async () => {
      const decrypted = await Promise.all(
        snap.docs.map(async (entry): Promise<Pin | null> => {
          try {
            const data = entry.data() as PinDoc;
            const s = await decryptJson<PinSnapshot>(key, data.snapshot);

            if (s.sender !== 'a' && s.sender !== 'b') return null;
            if (typeof s.preview !== 'string') return null;

            return {
              messageId: entry.id,
              sender: s.sender,
              kind: s.kind,
              createdAt: typeof s.createdAt === 'number' ? s.createdAt : data.pinnedAt,
              preview: s.preview.slice(0, PINS.PREVIEW_LENGTH),
              ...(typeof s.text === 'string' ? { text: s.text.slice(0, PINS.MAX_TEXT) } : {}),
              ...(s.media ? { media: s.media } : {}),
              pinnedAt: data.pinnedAt,
            };
          } catch {
            return null;
          }
        }),
      );

      onUpdate(
        decrypted
          .filter((entry): entry is Pin => entry !== null)
          .sort((left, right) => right.pinnedAt - left.pinnedAt),
      );
    })();
  });
}
