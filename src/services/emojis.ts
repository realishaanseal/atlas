import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import { getServices } from '@/firebase/app';
import { paths } from '@/firebase/paths';
import { EMOJI } from '@/config';
import { encrypt, decrypt, encryptJson, decryptJson, randomId } from '@/crypto';
import type { CustomEmojiDoc } from '@/types';
import { AppError } from '@/utils/result';

/**
 * Custom emoji storage.
 *
 * Shape mirrors the image pipeline — validate, re-encode, encrypt, store — with
 * two deliberate differences.
 *
 * First, no expiry. Every other collection carries `expiresAt` and gets swept
 * after 24 hours; an emoji pack that did that would be pointless, so these
 * documents have no expiry field at all and the rules do not apply
 * `validRetention` to them.
 *
 * Second, the name is encrypted. It would have been easier to store shortcodes
 * in the clear — the autocomplete could then read them without a key — but a
 * plaintext list of `:inside_joke:` names is a readable index of what the two
 * of you talk about, which is exactly what the rest of the app refuses to hand
 * over.
 */

// --- encoding --------------------------------------------------------------

/** Decrypted form, before the UI wraps the bytes in an object URL. */
export interface DecryptedEmoji {
  readonly id: string;
  readonly name: string;
  readonly mime: 'image/webp' | 'image/gif';
  readonly width: number;
  readonly height: number;
  readonly bytes: Uint8Array;
  readonly createdAt: number;
}

/**
 * Squares and shrinks a static image to emoji size.
 *
 * Aspect ratio is preserved rather than stretched — a squashed emoji looks
 * broken — so the result fits INSIDE the box rather than filling it.
 *
 * Re-encoding through a canvas is also what strips EXIF here, same as photos.
 * Someone uploading a cropped phone photo as an emoji would otherwise embed
 * their GPS coordinates in a permanent, non-expiring document.
 */
async function encodeStatic(file: File): Promise<{
  bytes: Uint8Array;
  width: number;
  height: number;
}> {
  const bitmap = await createImageBitmap(file);

  try {
    const scale = Math.min(1, EMOJI.MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new AppError('unknown', 'Canvas unavailable');
    context.drawImage(bitmap, 0, 0, width, height);

    for (const quality of EMOJI.QUALITY_STEPS) {
      const blob = await canvas.convertToBlob({ type: 'image/webp', quality });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (bytes.length <= EMOJI.MAX_ENCODED_BYTES) return { bytes, width, height };
    }

    throw new AppError('file-too-large', 'Could not compress that image small enough');
  } finally {
    bitmap.close();
  }
}

/** GIF dimensions without decoding every frame. */
async function gifDimensions(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

// --- write -----------------------------------------------------------------

export function normaliseName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^:+|:+$/g, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
}

export async function upload(
  conversationKey: CryptoKey,
  file: File,
  rawName: string,
): Promise<string> {
  const name = normaliseName(rawName);
  if (!EMOJI.NAME_PATTERN.test(name)) {
    throw new AppError(
      'unsupported-file',
      'Name must be 2–32 characters, using letters, numbers and underscores',
    );
  }

  if (!EMOJI.ACCEPTED_MIME.includes(file.type as (typeof EMOJI.ACCEPTED_MIME)[number])) {
    throw new AppError('unsupported-file', 'Only PNG, JPEG, WebP and GIF are supported');
  }
  if (file.size > EMOJI.MAX_UPLOAD_BYTES) {
    throw new AppError('file-too-large', 'That file is too large');
  }

  /**
   * Animated GIFs bypass the canvas, as everywhere else in this app: drawing an
   * animated GIF to a canvas yields a single still frame, and the animation is
   * the entire reason someone uploads one as an emoji.
   *
   * The cost is that a GIF is stored byte-for-byte, so no metadata is stripped
   * from it, and it cannot be resized either — an oversized GIF is rejected
   * rather than shrunk.
   */
  let bytes: Uint8Array;
  let width: number;
  let height: number;
  let mime: 'image/webp' | 'image/gif';

  if (file.type === 'image/gif') {
    bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > EMOJI.MAX_ENCODED_BYTES) {
      const kb = Math.round(bytes.length / 1024);
      const max = Math.round(EMOJI.MAX_ENCODED_BYTES / 1024);
      throw new AppError(
        'file-too-large',
        `That GIF is ${String(kb)} KB. Animated emoji must be under ${String(max)} KB — ` +
          'try a smaller or shorter one.',
      );
    }
    ({ width, height } = await gifDimensions(file));
    if (width > 512 || height > 512) {
      throw new AppError('file-too-large', 'Animated emoji must be 512×512 or smaller');
    }
    mime = 'image/gif';
  } else {
    ({ bytes, width, height } = await encodeStatic(file));
    mime = 'image/webp';
  }

  const { db, auth } = getServices();
  const id = randomId();

  const document: CustomEmojiDoc = {
    owner: auth.currentUser?.uid ?? '',
    createdAt: Date.now(),
    name: await encryptJson(conversationKey, name),
    mime,
    width,
    height,
    data: await encrypt(conversationKey, bytes),
  };

  await setDoc(doc(db, paths.emoji(id)), document);
  return id;
}

export async function remove(id: string): Promise<void> {
  const { db } = getServices();
  await deleteDoc(doc(db, paths.emoji(id)));
}

// --- read ------------------------------------------------------------------

/**
 * Loads and decrypts the whole pack.
 *
 * A one-shot read rather than a live subscription. The pack changes rarely —
 * only when someone adds or removes an emoji — and a permanent listener on a
 * collection of 100 documents would burn reads for almost no benefit. The
 * caller refetches after its own writes, and picks up the other person's
 * changes on the next unlock.
 */
export async function loadAll(conversationKey: CryptoKey): Promise<DecryptedEmoji[]> {
  const { db } = getServices();
  const snapshot = await getDocs(collection(db, paths.emojis()));

  const decrypted = await Promise.all(
    snapshot.docs.map(async (entry): Promise<DecryptedEmoji | null> => {
      try {
        const data = entry.data() as CustomEmojiDoc;
        const name = await decryptJson<string>(conversationKey, data.name);

        /**
         * Re-check the name after decrypting.
         *
         * Decryption proves the value came from whoever holds the key. It does
         * NOT prove the value is well-formed — a modified client could write a
         * name containing a colon, which would corrupt shortcode parsing for
         * both people, or one long enough to break the composer's layout.
         * Cheaper to drop a malformed entry than to render it.
         */
        if (typeof name !== 'string' || !EMOJI.NAME_PATTERN.test(name)) return null;
        if (data.mime !== 'image/webp' && data.mime !== 'image/gif') return null;

        const bytes = await decrypt(conversationKey, data.data);

        return {
          id: entry.id,
          name,
          mime: data.mime,
          width: data.width,
          height: data.height,
          bytes,
          createdAt: data.createdAt,
        };
      } catch {
        // One unreadable emoji should not blank the whole pack.
        return null;
      }
    }),
  );

  return decrypted
    .filter((entry): entry is DecryptedEmoji => entry !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
}
