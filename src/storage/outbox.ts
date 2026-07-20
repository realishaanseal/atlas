import * as db from './db';
import type { PendingSend } from '@/services/messages';

/**
 * Offline outbox.
 *
 * The brief asks for "automatic retry after temporary disconnect". Firestore's
 * own offline queue covers a brief blip, but it lives in memory for the tab's
 * lifetime — a backgrounded mobile tab that gets evicted loses the write
 * silently, which is the worst possible failure for a messenger.
 *
 * So a message is encrypted first, persisted here, and only then written. The
 * entry is removed once the write is acknowledged. Anything still present on
 * next launch is retried.
 *
 * Note what is stored: already-encrypted envelopes. The plaintext never
 * reaches IndexedDB, so an attacker with disk access gains nothing they could
 * not get from the database itself.
 */

const KEY = 'outbox';

export async function all(): Promise<PendingSend[]> {
  return (await db.get<PendingSend[]>(KEY)) ?? [];
}

export async function add(pending: PendingSend): Promise<void> {
  await db.set(KEY, [...(await all()), pending]);
}

export async function remove(id: string): Promise<void> {
  await db.set(
    KEY,
    (await all()).filter((entry) => entry.id !== id),
  );
}

/** Drops entries whose 24h window elapsed while we were offline. */
export async function prune(): Promise<void> {
  const now = Date.now();
  await db.set(
    KEY,
    (await all()).filter((entry) => entry.expiresAt > now),
  );
}
