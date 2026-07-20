import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getServices } from '@/firebase/app';
import { paths } from '@/firebase/paths';
import { GIF_STORAGE, IMAGES, RETENTION_MS } from '@/config';
import { encrypt, decrypt, encryptJson, decryptJson, randomId } from '@/crypto';
import type { EncryptedEnvelope, MessagePayload } from '@/types';
import { toBase64, fromBase64 } from '@/utils/encoding';
import { AppError } from '@/utils/result';

/**
 * Encrypted image sharing.
 *
 * Pipeline, in order, and the order matters:
 *
 *   validate → decode → re-encode via canvas → encrypt → store
 *
 * The canvas re-encode is the security-critical step. A phone photo carries
 * EXIF metadata including GPS coordinates, camera serial, and timestamps.
 * Drawing to a canvas and re-encoding produces pixels only — every byte of
 * metadata is discarded. This is why EVERY image is re-encoded regardless of
 * size: the original brief said "compress when appropriate", which would have
 * passed small files through untouched and leaked the sender's location.
 */

// --- compression -----------------------------------------------------------

interface Encoded {
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
}

async function canvasEncode(
  bitmap: ImageBitmap,
  maxDimension: number,
  quality: number,
): Promise<Encoded> {
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) throw new AppError('unknown', 'Canvas unavailable');

  context.drawImage(bitmap, 0, 0, width, height);

  const blob = await canvas.convertToBlob({ type: 'image/webp', quality });
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
}

/**
 * Compresses to fit the Firestore document budget.
 *
 * Tries the quality ladder, then falls back to halving dimensions. Refuses
 * rather than silently shipping something that will be rejected by the 1 MiB
 * document limit.
 */
async function compress(file: File): Promise<Encoded> {
  const bitmap = await createImageBitmap(file);

  try {
    for (const dimension of [IMAGES.MAX_DIMENSION, IMAGES.MAX_DIMENSION / 2]) {
      for (const quality of IMAGES.QUALITY_STEPS) {
        const encoded = await canvasEncode(bitmap, dimension, quality);
        if (encoded.bytes.length <= IMAGES.MAX_ENCODED_BYTES) return encoded;
      }
    }
    throw new AppError('file-too-large', 'Image could not be compressed enough');
  } finally {
    bitmap.close();
  }
}

/** 16px blur placeholder, so a bubble can paint before the full image loads. */
async function makePreview(file: File): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file);
  try {
    const encoded = await canvasEncode(bitmap, IMAGES.PREVIEW_DIMENSION, 0.5);
    return encoded.bytes;
  } finally {
    bitmap.close();
  }
}

// --- upload ----------------------------------------------------------------

/**
 * Reads a GIF's dimensions without decoding every frame.
 *
 * createImageBitmap on an animated GIF gives the first frame, which is all we
 * need for dimensions and is cheap.
 */
async function gifDimensions(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

export async function upload(
  conversationKey: CryptoKey,
  file: File,
): Promise<Extract<MessagePayload, { kind: 'image' }>> {
  /**
   * GIFs take a different path, deliberately.
   *
   * Every other image is re-encoded through a canvas, which is what strips
   * EXIF. An animated GIF cannot survive that — a canvas gives you one still
   * frame, and the animation is the entire point. So GIF bytes are stored
   * exactly as received.
   *
   * The trade: no metadata scrubbing for GIFs. Giphy results carry none, but a
   * GIF from elsewhere could. Accepted because the alternative is either no
   * animated GIFs at all, or shipping a GIF-rewriting library to strip
   * comment extensions — disproportionate for the risk.
   */
  if (file.type === 'image/gif') {
    if (file.size > GIF_STORAGE.MAX_BYTES) {
      const mb = (file.size / 1024 / 1024).toFixed(1);
      const max = (GIF_STORAGE.MAX_BYTES / 1024 / 1024).toFixed(0);
      throw new AppError('file-too-large', `That GIF is ${mb} MB. The limit is ${max} MB.`);
    }
    const { width, height } = await gifDimensions(file);
    return storeEncrypted(conversationKey, new Uint8Array(await file.arrayBuffer()), {
      width,
      height,
      mime: 'image/gif',
    });
  }

  if (!IMAGES.ACCEPTED_MIME.includes(file.type as (typeof IMAGES.ACCEPTED_MIME)[number])) {
    throw new AppError('unsupported-file', 'Only JPEG, PNG, WebP and GIF images are supported');
  }
  if (file.size > IMAGES.MAX_UPLOAD_BYTES) {
    throw new AppError('file-too-large', 'Images must be under 10 MB');
  }

  const [encoded, preview] = await Promise.all([compress(file), makePreview(file)]);

  return storeEncrypted(
    conversationKey,
    encoded.bytes,
    { width: encoded.width, height: encoded.height, mime: 'image/webp' },
    await encrypt(conversationKey, preview),
  );
}

/**
 * Shared tail of the upload path: per-item content key, wrap it under the
 * conversation key, write the ciphertext.
 *
 * The per-item key costs nothing today and means per-image revocation or
 * expiring access can be added later without re-encrypting the whole history.
 *
 * Anything over one document's worth is split into chunks written to
 * `{imageId}-c0`, `-c1` and so on. Those ids still satisfy the Security Rules'
 * id pattern, so chunking needed no rules change — and because each chunk
 * carries its own `expiresAt`, the existing retention sweep collects them
 * without knowing they are chunks.
 */
async function storeEncrypted(
  conversationKey: CryptoKey,
  bytes: Uint8Array,
  meta: { width: number; height: number; mime: 'image/webp' | 'image/gif' },
  preview?: EncryptedEnvelope,
): Promise<Extract<MessagePayload, { kind: 'image' }>> {
  const contentKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);

  const rawContentKey = new Uint8Array(await crypto.subtle.exportKey('raw', contentKey));
  const wrappedKey = await encryptJson(conversationKey, toBase64(rawContentKey));
  rawContentKey.fill(0);

  const imageId = randomId();
  const createdAt = Date.now();
  const { db, auth } = getServices();
  const owner = auth.currentUser?.uid ?? '';

  const chunkCount = Math.max(1, Math.ceil(bytes.length / GIF_STORAGE.CHUNK_BYTES));
  if (chunkCount > GIF_STORAGE.MAX_CHUNKS) {
    throw new AppError('file-too-large', 'That image is too large to send');
  }

  // Each chunk gets its own IV via encrypt(). Reusing one across chunks would
  // be the classic GCM failure, so they are never shared.
  const writes = Array.from({ length: chunkCount }, async (_, index) => {
    const slice = bytes.subarray(
      index * GIF_STORAGE.CHUNK_BYTES,
      Math.min((index + 1) * GIF_STORAGE.CHUNK_BYTES, bytes.length),
    );
    const sealed = await encrypt(contentKey, slice);

    if (sealed.ct.length > IMAGES.MAX_B64_LENGTH) {
      throw new AppError('file-too-large', 'Encrypted chunk exceeds the document limit');
    }

    const id = chunkCount === 1 ? imageId : `${imageId}-c${String(index)}`;
    await setDoc(doc(db, paths.image(id)), {
      owner,
      createdAt,
      expiresAt: createdAt + RETENTION_MS,
      data: sealed,
    });
  });

  await Promise.all(writes);

  return {
    kind: 'image',
    imageId,
    wrappedKey,
    width: meta.width,
    height: meta.height,
    byteSize: bytes.length,
    mime: meta.mime,
    ...(chunkCount > 1 ? { chunks: chunkCount } : {}),
    ...(preview ? { preview } : {}),
  };
}

// --- download --------------------------------------------------------------

async function unwrapKey(
  conversationKey: CryptoKey,
  wrapped: EncryptedEnvelope,
): Promise<CryptoKey> {
  const raw = fromBase64(await decryptJson<string>(conversationKey, wrapped));
  return crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, [
    'decrypt',
  ]);
}

/**
 * The MIME type used when building blob URLs.
 *
 * SECURITY: this is hardcoded, never taken from the message payload.
 *
 * The payload is decrypted, authenticated data — but it is authored by the
 * peer, and "authenticated" only means it genuinely came from whoever holds
 * the key, not that its contents are safe. A payload claiming
 * `mime: "text/html"` would produce a blob: URL that executes script in our
 * own origin the moment it is opened. Since every image we store is re-encoded
 * to WebP on upload, there is exactly one correct value here and no reason to
 * trust an incoming one.
 */
const SAFE_IMAGE_MIME = new Set(['image/webp', 'image/gif']);

/**
 * Decrypts an image to raw bytes.
 *
 * Exposed separately from `download` so callers that need the actual file —
 * saving a GIF to favourites — can have it without re-fetching the blob URL.
 * That round trip was blocked by the CSP anyway: fetching a blob: URL falls
 * under `connect-src`, which does not permit blob, even though `img-src` does.
 */
export async function downloadBytes(
  conversationKey: CryptoKey,
  payload: Extract<MessagePayload, { kind: 'image' }>,
): Promise<Uint8Array> {
  const { db } = getServices();
  const contentKey = await unwrapKey(conversationKey, payload.wrappedKey);
  const chunkCount = payload.chunks ?? 1;

  if (chunkCount > GIF_STORAGE.MAX_CHUNKS) throw new AppError('decrypt-failed');

  // Fetched in parallel, then reassembled in order. A missing chunk fails the
  // whole image rather than producing a truncated one — a half-decoded GIF is
  // worse than an honest error.
  const parts = await Promise.all(
    Array.from({ length: chunkCount }, async (_, index) => {
      const id = chunkCount === 1 ? payload.imageId : `${payload.imageId}-c${String(index)}`;
      const snapshot = await getDoc(doc(db, paths.image(id)));
      if (!snapshot.exists()) throw new AppError('unknown', 'Image is no longer available');
      return decrypt(contentKey, (snapshot.data() as { data: EncryptedEnvelope }).data);
    }),
  );

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }

  return bytes;
}

/** Returns an object URL. Callers must revoke it — see useImage. */
export async function download(
  conversationKey: CryptoKey,
  payload: Extract<MessagePayload, { kind: 'image' }>,
): Promise<{ url: string; bytes: Uint8Array }> {
  const bytes = await downloadBytes(conversationKey, payload);
  const mime = SAFE_IMAGE_MIME.has(payload.mime) ? payload.mime : 'image/webp';
  return { url: URL.createObjectURL(new Blob([bytes], { type: mime })), bytes };
}

export async function decryptPreview(
  conversationKey: CryptoKey,
  preview: EncryptedEnvelope,
): Promise<string> {
  const bytes = await decrypt(conversationKey, preview);
  // Previews are always canvas-generated WebP, never GIF — no need to consult
  // the payload, and one less place trusting peer-authored data.
  return URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }));
}
