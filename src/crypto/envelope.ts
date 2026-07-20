import { CRYPTO } from '@/config';
import type { B64, EncryptedEnvelope } from '@/types';
import { toBase64, fromBase64, encodeUtf8, decodeUtf8 } from '@/utils/encoding';
import { AppError } from '@/utils/result';

/**
 * AES-256-GCM encryption.
 *
 * Invariants enforced here, and nowhere else in the codebase:
 *
 *  1. A fresh 12-byte IV from crypto.getRandomValues() on EVERY encrypt call.
 *     IV reuse under a fixed key is the one mistake that catastrophically
 *     breaks GCM — it leaks the XOR of plaintexts and, worse, allows forgery.
 *     So IVs are never derived, never counted, never cached.
 *  2. Decryption failure is always reported as the same opaque error. A wrong
 *     key and a corrupted ciphertext must be indistinguishable to the caller,
 *     because distinguishing them is an oracle.
 */

export async function encrypt(key: CryptoKey, plaintext: Uint8Array): Promise<EncryptedEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(CRYPTO.IV_BYTES));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext,
  );

  return {
    v: 1,
    iv: toBase64(iv),
    ct: toBase64(new Uint8Array(ciphertext)),
  };
}

export async function decrypt(key: CryptoKey, envelope: EncryptedEnvelope): Promise<Uint8Array> {
  if (envelope.v !== 1) throw new AppError('decrypt-failed');

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(envelope.iv) as BufferSource },
      key,
      fromBase64(envelope.ct),
    );
    return new Uint8Array(plaintext);
  } catch {
    // Deliberately opaque. Never surface the underlying reason.
    throw new AppError('decrypt-failed');
  }
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<EncryptedEnvelope> {
  return encrypt(key, encodeUtf8(JSON.stringify(value)));
}

export async function decryptJson<T>(key: CryptoKey, envelope: EncryptedEnvelope): Promise<T> {
  const bytes = await decrypt(key, envelope);
  try {
    return JSON.parse(decodeUtf8(bytes)) as T;
  } catch {
    throw new AppError('decrypt-failed');
  }
}

/** Random 128-bit identifier, base64url. Used for message and image ids. */
export function randomId(): B64 {
  return toBase64(crypto.getRandomValues(new Uint8Array(16)));
}
