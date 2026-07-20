import { PASSPHRASE } from '@/config';
import * as db from './db';

/**
 * Failed-unlock backoff.
 *
 * Worth being clear about what this does and does not do. It slows down
 * someone sitting at an unlocked browser guessing passphrases. It does
 * NOTHING against an attacker who has scraped the ciphertext and is brute
 * forcing offline, where our code is not in the loop at all — the only defence
 * there is the 900,000 PBKDF2 iterations and a strong passphrase.
 *
 * Persisted rather than in-memory so a page reload does not reset the counter.
 */

const KEY = 'unlock-attempts';

interface AttemptState {
  readonly failures: number;
  readonly lastFailureAt: number;
}

export async function getDelayMs(): Promise<number> {
  const state = await db.get<AttemptState>(KEY);
  if (!state || state.failures < PASSPHRASE.THROTTLE_AFTER_ATTEMPTS) return 0;

  const excess = state.failures - PASSPHRASE.THROTTLE_AFTER_ATTEMPTS;
  const penalty = Math.min(
    PASSPHRASE.THROTTLE_BASE_MS * 2 ** excess,
    PASSPHRASE.THROTTLE_MAX_MS,
  );

  const elapsed = Date.now() - state.lastFailureAt;
  return Math.max(0, penalty - elapsed);
}

export async function recordFailure(): Promise<void> {
  const state = await db.get<AttemptState>(KEY);
  await db.set(KEY, {
    failures: (state?.failures ?? 0) + 1,
    lastFailureAt: Date.now(),
  } satisfies AttemptState);
}

export async function clearFailures(): Promise<void> {
  await db.remove(KEY);
}
