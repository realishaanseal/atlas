import { CRYPTO } from '@/config';
import type { B64, KdfParams } from '@/types';
import { toBase64, fromBase64 } from '@/utils/encoding';
import { AppError } from '@/utils/result';

/**
 * Key derivation.
 *
 * PBKDF2-HMAC-SHA256 over a public random salt. Argon2id would be the better
 * primitive, but there is no native Web Crypto implementation, so using it
 * means shipping a WASM blob. For a two-person app the realistic attacker is
 * someone who found the URL, and ~2M iterations is a proportionate cost.
 * `KdfParams.v` exists so this can be migrated later without orphaning
 * existing messages.
 */

export function createKdfParams(): KdfParams {
  return {
    v: 1,
    algorithm: 'PBKDF2',
    hash: 'SHA-256',
    iterations: CRYPTO.PBKDF2_ITERATIONS,
    salt: toBase64(crypto.getRandomValues(new Uint8Array(CRYPTO.SALT_BYTES))),
  };
}

/**
 * The derivation itself, with no worker involved.
 *
 * Shared by the worker and by the inline fallback so there is exactly one
 * implementation of the security-critical part — a second copy inside the
 * worker would be a place for the two to drift.
 */
export async function derivePbkdf2(passphrase: string, params: KdfParams): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromBase64(params.salt), iterations: params.iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    // Non-extractable: the raw key bytes can never be read back out, not by
    // our code and not by anything injected into the page.
    false,
    ['encrypt', 'decrypt'],
  );
}

function validate(params: KdfParams): void {
  if (params.algorithm !== 'PBKDF2' || params.hash !== 'SHA-256') {
    throw new AppError('unknown', 'Unsupported key derivation parameters');
  }
  // Guards against a tampered kdf document specifying iterations=1.
  if (params.iterations < 600_000) {
    throw new AppError('unknown', 'Key derivation parameters are too weak');
  }
}

/**
 * Derives the conversation key, off the main thread where possible.
 *
 * Two million PBKDF2 iterations takes long enough to freeze the UI mid-unlock,
 * so a Worker does the work and is terminated immediately afterwards — which
 * also narrows the window in which the passphrase exists in memory at all.
 *
 * Falls back to deriving inline where Workers are unavailable (test runners,
 * some embedded webviews). The fallback blocks briefly rather than failing,
 * which is the right trade: a frozen second beats an app that will not open.
 */
export async function deriveKey(passphrase: string, params: KdfParams): Promise<CryptoKey> {
  validate(params);

  if (typeof Worker === 'undefined') return derivePbkdf2(passphrase, params);

  const worker = new Worker(new URL('./derive.worker.ts', import.meta.url), { type: 'module' });

  try {
    return await new Promise<CryptoKey>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<{ ok: boolean; key?: CryptoKey }>) => {
        if (event.data.ok && event.data.key) resolve(event.data.key);
        else reject(new AppError('unknown', 'Key derivation failed'));
      };
      worker.onerror = () => {
        reject(new AppError('unknown', 'Key derivation failed'));
      };
      worker.postMessage({ passphrase, params });
    });
  } finally {
    // Terminate regardless of outcome so the passphrase does not linger in a
    // worker heap we no longer control.
    worker.terminate();
  }
}

export const saltToB64 = (salt: Uint8Array): B64 => toBase64(salt);
