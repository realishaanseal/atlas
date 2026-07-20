import { derivePbkdf2 } from './derive';
import type { KdfParams } from '@/types';

/**
 * PBKDF2 worker.
 *
 * Derivation runs off the main thread because 2,000,000 iterations takes long
 * enough to freeze the UI mid-unlock, and because confining the passphrase to
 * a worker that is terminated immediately afterwards narrows the window in
 * which it exists in memory at all.
 *
 * The derivation itself lives in derive.ts and is imported rather than
 * duplicated here — one implementation of the security-critical path, no
 * chance of the two drifting apart.
 */

interface DeriveRequest {
  readonly passphrase: string;
  readonly params: KdfParams;
}

self.onmessage = async (event: MessageEvent<DeriveRequest>) => {
  try {
    // The derived CryptoKey is non-extractable and structured-cloned back to
    // the main thread; the raw bytes never cross the boundary.
    const key = await derivePbkdf2(event.data.passphrase, event.data.params);
    self.postMessage({ ok: true, key });
  } catch {
    self.postMessage({ ok: false });
  }
};
