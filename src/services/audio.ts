import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getServices } from '@/firebase/app';
import { paths } from '@/firebase/paths';
import { AUDIO, RETENTION_MS } from '@/config';
import { encrypt, decrypt, encryptJson, decryptJson, randomId } from '@/crypto';
import type { EncryptedEnvelope, MessagePayload } from '@/types';
import { toBase64, fromBase64 } from '@/utils/encoding';
import { AppError } from '@/utils/result';

/**
 * Encrypted voice messages.
 *
 * Mirrors the image pipeline: per-clip content key, wrapped under the
 * conversation key, ciphertext in its own Firestore collection so subscribing
 * to the message list never drags audio payloads along with it.
 *
 * Recording itself lives in useRecorder — this module only handles the
 * encrypt/store/fetch half.
 */

export type AudioPayload = Extract<MessagePayload, { kind: 'audio' }>;

/** The first container the browser will actually record. Safari differs. */
export function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return AUDIO.MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

export function isSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    pickMimeType() !== ''
  );
}

export async function upload(
  conversationKey: CryptoKey,
  blob: Blob,
  durationMs: number,
  peaks: number[],
): Promise<AudioPayload> {
  const bytes = new Uint8Array(await blob.arrayBuffer());

  if (bytes.length > AUDIO.MAX_ENCODED_BYTES) {
    throw new AppError('file-too-large', 'Recording is too long to send');
  }

  const contentKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);

  const sealed = await encrypt(contentKey, bytes);
  const rawContentKey = new Uint8Array(await crypto.subtle.exportKey('raw', contentKey));
  const wrappedKey = await encryptJson(conversationKey, toBase64(rawContentKey));
  rawContentKey.fill(0);

  const audioId = randomId();
  const createdAt = Date.now();

  const { db, auth } = getServices();
  await setDoc(doc(db, paths.audioClip(audioId)), {
    owner: auth.currentUser?.uid ?? '',
    createdAt,
    expiresAt: createdAt + RETENTION_MS,
    data: sealed,
  });

  return {
    kind: 'audio',
    audioId,
    wrappedKey,
    durationMs,
    byteSize: bytes.length,
    mime: blob.type || 'audio/webm',
    peaks,
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

/**
 * SECURITY: the blob MIME is constrained to a known-safe allowlist rather than
 * taken from the payload. A payload claiming `text/html` would otherwise
 * produce a blob: URL that executes script in our own origin when played.
 * Same class of bug as the image pipeline had — see ARCHITECTURE.md §9a.
 */
const SAFE_AUDIO_MIME = new Set([
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/mp4;codecs=opus',
  'audio/ogg',
  'audio/ogg;codecs=opus',
]);

/**
 * Decrypts a voice clip to raw bytes.
 *
 * Exposed separately from `download` so the local archive can persist the clip
 * itself — the archive keeps the memory past the 24h sweep, so it needs the
 * bytes, not a throwaway object URL. Throws once the clip has been swept.
 */
export async function downloadBytes(
  conversationKey: CryptoKey,
  payload: AudioPayload,
): Promise<Uint8Array> {
  const { db } = getServices();
  const snapshot = await getDoc(doc(db, paths.audioClip(payload.audioId)));
  if (!snapshot.exists()) throw new AppError('unknown', 'Recording is no longer available');

  const contentKey = await unwrapKey(conversationKey, payload.wrappedKey);
  return decrypt(contentKey, (snapshot.data() as { data: EncryptedEnvelope }).data);
}

/** The blob MIME, constrained to the known-safe allowlist. See SAFE_AUDIO_MIME. */
export function safeAudioMime(mime: string): string {
  return SAFE_AUDIO_MIME.has(mime) ? mime : 'audio/webm';
}

/** Returns an object URL. Callers must revoke it — see useAudio. */
export async function download(
  conversationKey: CryptoKey,
  payload: AudioPayload,
): Promise<string> {
  const bytes = await downloadBytes(conversationKey, payload);
  return URL.createObjectURL(new Blob([bytes], { type: safeAudioMime(payload.mime) }));
}
