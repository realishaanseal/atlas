import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getServices } from '@/firebase/app';
import { paths } from '@/firebase/paths';
import { VIDEO, RETENTION_MS } from '@/config';
import { encrypt, decrypt, encryptJson, decryptJson, randomId } from '@/crypto';
import type { EncryptedEnvelope, MessagePayload } from '@/types';
import { toBase64, fromBase64 } from '@/utils/encoding';
import { AppError } from '@/utils/result';

/**
 * Encrypted video sharing.
 *
 * Mirrors the image/GIF pipeline: a per-clip content key wrapped under the
 * conversation key, ciphertext chunked across its own Firestore collection so
 * subscribing to messages never drags a clip along with it.
 *
 * Unlike photos, video is stored byte-for-byte — there is no cheap in-browser
 * transcode, and a canvas would flatten it to a single frame — so, as with
 * GIFs, no metadata is scrubbed. A poster frame (the first frame, re-encoded to
 * WebP through a canvas) IS captured, both for the bubble and because that
 * re-encode is metadata-free.
 */

export type VideoPayload = Extract<MessagePayload, { kind: 'video' }>;

const SAFE_VIDEO_MIME = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

function safeMime(mime: string): string {
  return SAFE_VIDEO_MIME.has(mime) ? mime : 'video/mp4';
}

function once(target: EventTarget, event: string, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener(event, onOk);
      target.removeEventListener('error', onErr);
      clearTimeout(timer);
    };
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new AppError('unsupported-file', 'Could not read that video'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new AppError('unsupported-file', 'Video took too long to read'));
    }, timeoutMs);
    target.addEventListener(event, onOk, { once: true });
    target.addEventListener('error', onErr, { once: true });
  });
}

interface Probe {
  width: number;
  height: number;
  durationMs: number;
  poster: Uint8Array | null;
}

/** Reads dimensions and duration, and grabs a first-frame poster if it can. */
async function probe(file: File): Promise<Probe> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    await once(video, 'loadedmetadata', 15000);
    const width = video.videoWidth || 0;
    const height = video.videoHeight || 0;
    const durationMs = Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0;

    let poster: Uint8Array | null = null;
    try {
      // A hair into the clip rather than exactly 0 — the very first frame is
      // often black on phone recordings.
      video.currentTime = Math.min(0.1, (video.duration || 0) / 2);
      await once(video, 'seeked', 8000);
      poster = await makePoster(video, width, height);
    } catch {
      // Poster is cosmetic; a clip with no readable frame still sends.
    }

    return { width, height, durationMs, poster };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** One canvas encode at a given max dimension and quality. */
async function encodeFrame(
  video: HTMLVideoElement,
  width: number,
  height: number,
  dimension: number,
  quality: number,
): Promise<Uint8Array | null> {
  const scale = Math.min(1, dimension / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(video, 0, 0, w, h);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/webp', quality);
  });
  if (!blob) return null;
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * The smallest-first poster that fits the inline budget.
 *
 * The poster rides inside the message body, which is capped at 16 KB of
 * ciphertext, so a frame that will not compress under POSTER_MAX_BYTES is
 * dropped rather than shipped — the bubble falls back to a plain play button.
 */
async function makePoster(
  video: HTMLVideoElement,
  width: number,
  height: number,
): Promise<Uint8Array | null> {
  if (width === 0 || height === 0) return null;
  for (const dimension of VIDEO.POSTER_DIMENSIONS) {
    for (const quality of VIDEO.POSTER_QUALITY_STEPS) {
      const bytes = await encodeFrame(video, width, height, dimension, quality);
      if (bytes && bytes.length <= VIDEO.POSTER_MAX_BYTES) return bytes;
    }
  }
  return null;
}

export async function upload(conversationKey: CryptoKey, file: File): Promise<VideoPayload> {
  if (!VIDEO.ACCEPTED_MIME.includes(file.type as (typeof VIDEO.ACCEPTED_MIME)[number])) {
    throw new AppError('unsupported-file', 'Only MP4, WebM and MOV videos are supported');
  }
  if (file.size > VIDEO.MAX_UPLOAD_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(0);
    const max = (VIDEO.MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(0);
    throw new AppError('file-too-large', `That video is ${mb} MB. The limit is ${max} MB.`);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { width, height, durationMs, poster } = await probe(file);

  const contentKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  const rawContentKey = new Uint8Array(await crypto.subtle.exportKey('raw', contentKey));
  const wrappedKey = await encryptJson(conversationKey, toBase64(rawContentKey));
  rawContentKey.fill(0);

  const videoId = randomId();
  const createdAt = Date.now();
  const { db, auth } = getServices();
  const owner = auth.currentUser?.uid ?? '';

  const chunkCount = Math.max(1, Math.ceil(bytes.length / VIDEO.CHUNK_BYTES));
  if (chunkCount > VIDEO.MAX_CHUNKS) {
    throw new AppError('file-too-large', 'That video is too large to send');
  }

  const writes = Array.from({ length: chunkCount }, async (_, index) => {
    const slice = bytes.subarray(
      index * VIDEO.CHUNK_BYTES,
      Math.min((index + 1) * VIDEO.CHUNK_BYTES, bytes.length),
    );
    const sealed = await encrypt(contentKey, slice);
    if (sealed.ct.length > 1_000_000) {
      throw new AppError('file-too-large', 'Encrypted chunk exceeds the document limit');
    }
    const id = chunkCount === 1 ? videoId : `${videoId}-c${String(index)}`;
    await setDoc(doc(db, paths.video(id)), {
      owner,
      createdAt,
      expiresAt: createdAt + RETENTION_MS,
      data: sealed,
    });
  });

  await Promise.all(writes);

  return {
    kind: 'video',
    videoId,
    wrappedKey,
    width,
    height,
    byteSize: bytes.length,
    durationMs,
    mime: safeMime(file.type),
    ...(chunkCount > 1 ? { chunks: chunkCount } : {}),
    ...(poster ? { poster: await encrypt(conversationKey, poster) } : {}),
  };
}

async function unwrapKey(
  conversationKey: CryptoKey,
  wrapped: EncryptedEnvelope,
): Promise<CryptoKey> {
  const raw = fromBase64(await decryptJson<string>(conversationKey, wrapped));
  return crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, [
    'decrypt',
  ]);
}

/** Decrypts a clip to raw bytes, reassembling its chunks in order. */
export async function downloadBytes(
  conversationKey: CryptoKey,
  payload: VideoPayload,
): Promise<Uint8Array> {
  const { db } = getServices();
  const contentKey = await unwrapKey(conversationKey, payload.wrappedKey);
  const chunkCount = payload.chunks ?? 1;
  if (chunkCount > VIDEO.MAX_CHUNKS) throw new AppError('decrypt-failed');

  const parts = await Promise.all(
    Array.from({ length: chunkCount }, async (_, index) => {
      const id = chunkCount === 1 ? payload.videoId : `${payload.videoId}-c${String(index)}`;
      const snapshot = await getDoc(doc(db, paths.video(id)));
      if (!snapshot.exists()) throw new AppError('unknown', 'Video is no longer available');
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

/** Returns an object URL for the clip. Callers must revoke it. */
export async function download(conversationKey: CryptoKey, payload: VideoPayload): Promise<string> {
  const bytes = await downloadBytes(conversationKey, payload);
  return URL.createObjectURL(new Blob([bytes], { type: safeMime(payload.mime) }));
}

/** Returns an object URL for the poster (WebP). Callers must revoke it. */
export async function decryptPoster(
  conversationKey: CryptoKey,
  poster: EncryptedEnvelope,
): Promise<string> {
  const bytes = await decrypt(conversationKey, poster);
  return URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }));
}
