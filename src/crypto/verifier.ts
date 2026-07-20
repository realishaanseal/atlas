import { CRYPTO } from '@/config';
import type { EncryptedEnvelope } from '@/types';
import { encodeUtf8, decodeUtf8 } from '@/utils/encoding';
import { encrypt, decrypt } from './envelope';

/**
 * Passphrase verification.
 *
 * We cannot check a passphrase by comparing hashes without introducing a
 * second, weaker path to the same secret. Instead we store a fixed known
 * plaintext encrypted under the derived key. If GCM's authentication tag
 * validates on decryption, the key is correct.
 *
 * The useful property: a wrong passphrase and a corrupted verifier are
 * indistinguishable, and neither reveals anything about the correct
 * passphrase. The verifier is safe to store in cleartext-readable Firestore.
 */

export function makeVerifier(key: CryptoKey): Promise<EncryptedEnvelope> {
  return encrypt(key, encodeUtf8(CRYPTO.VERIFIER_PLAINTEXT));
}

export async function checkVerifier(
  key: CryptoKey,
  verifier: EncryptedEnvelope,
): Promise<boolean> {
  try {
    const bytes = await decrypt(key, verifier);
    return decodeUtf8(bytes) === CRYPTO.VERIFIER_PLAINTEXT;
  } catch {
    return false;
  }
}
