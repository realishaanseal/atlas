/**
 * Wire-format types for the encryption layer.
 *
 * Everything in this file describes bytes that Firebase is allowed to see.
 * If a field here ever contains plaintext, that is a bug.
 */

/** Base64url-encoded binary. Branded so it cannot be confused with plaintext. */
export type B64 = string & { readonly __b64: unique symbol };

/**
 * A single AES-256-GCM ciphertext with its nonce.
 *
 * `iv` is 12 random bytes, generated fresh for every single encryption.
 * Reusing an IV under the same key catastrophically breaks GCM, so IVs are
 * never derived, never counted, and never reused.
 *
 * `v` is the envelope version. It exists so that a future key-agreement scheme
 * (see ARCHITECTURE.md) can be introduced without breaking old messages.
 */
export interface EncryptedEnvelope {
  readonly v: 1;
  readonly iv: B64;
  readonly ct: B64;
}

/**
 * Public, non-secret key-derivation parameters.
 *
 * These live in Firestore in cleartext. That is safe and standard: a PBKDF2
 * salt is not a secret, it exists to make precomputed rainbow tables useless.
 * Both devices must read the same salt to derive the same key, so it has to be
 * shared somewhere, and the database is the only shared surface we have.
 */
export interface KdfParams {
  readonly v: 1;
  readonly algorithm: 'PBKDF2';
  readonly hash: 'SHA-256';
  readonly iterations: number;
  readonly salt: B64;
}

/**
 * Stored proof that a supplied passphrase derived the right key.
 *
 * We cannot verify a passphrase by comparing hashes without weakening the
 * scheme, so instead we store a fixed known plaintext encrypted under the
 * derived key. Decryption succeeding (GCM auth tag validates) proves the key
 * is correct. Decryption failing is indistinguishable from a wrong passphrase,
 * which is exactly what we want.
 */
export interface KeyVerifier {
  readonly envelope: EncryptedEnvelope;
  readonly createdAt: number;
}

/** The derived symmetric key plus the params that produced it. Never persisted. */
export interface DerivedKey {
  readonly key: CryptoKey;
  readonly params: KdfParams;
}
