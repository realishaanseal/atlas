import { deriveKey, createKdfParams, makeVerifier, checkVerifier } from '@/crypto';
import { ensureSignedIn } from './auth';
import * as room from './room';
import * as throttle from '@/storage/throttle';
import type { ParticipantId } from '@/types';
import { AppError } from '@/utils/result';

/**
 * The unlock flow.
 *
 * Two distinct paths depending on whether the room has been set up:
 *
 *   Setup   — no kdf document exists. This device generates a salt, derives a
 *             key from the chosen passphrase, writes salt + verifier, creates
 *             the room, and claims slot A.
 *
 *   Unlock  — a kdf document exists. Derive using its salt, check the
 *             verifier, then claim a slot (or refuse if both are taken).
 *
 * The order matters: we verify the passphrase BEFORE touching pairing state.
 * A wrong passphrase must not consume a device slot, or two failed attempts
 * from a new browser would lock out a legitimate device.
 */

export type SessionPhase = 'setup' | 'unlock';

export interface UnlockedSession {
  readonly key: CryptoKey;
  readonly slot: ParticipantId;
}

export async function detectPhase(): Promise<SessionPhase> {
  await ensureSignedIn();
  const kdf = await room.readKdf();
  return kdf === null ? 'setup' : 'unlock';
}

/** First-run setup. Establishes the passphrase for both people. */
export async function setup(passphrase: string): Promise<UnlockedSession> {
  await ensureSignedIn();

  if (await room.readKdf()) {
    // Someone set it up between detectPhase() and now.
    return unlock(passphrase);
  }

  const params = createKdfParams();
  const key = await deriveKey(passphrase, params);
  const verifier = await makeVerifier(key);

  const existing = await room.readRoom();
  const slot = existing.exists ? await room.claimSlot() : await room.createRoom();

  await room.writeKdf(params, verifier);
  await throttle.clearFailures();

  return { key, slot };
}

export async function unlock(passphrase: string): Promise<UnlockedSession> {
  const delay = await throttle.getDelayMs();
  if (delay > 0) {
    throw new AppError('unknown', `Too many attempts. Wait ${Math.ceil(delay / 1000)}s.`);
  }

  await ensureSignedIn();

  const kdf = await room.readKdf();
  if (!kdf) throw new AppError('unknown', 'Workspace is not set up yet');

  const key = await deriveKey(passphrase, {
    v: 1,
    algorithm: kdf.algorithm,
    hash: kdf.hash,
    iterations: kdf.iterations,
    salt: kdf.salt,
  });

  if (!(await checkVerifier(key, kdf.verifier))) {
    await throttle.recordFailure();
    throw new AppError('bad-passphrase');
  }

  // Correct passphrase. Only now do we touch pairing.
  await throttle.clearFailures();

  const slot = await room.claimSlot();
  return { key, slot };
}

export const openRepairWindow = room.openRepairWindow;
export const openLinkWindow = room.openLinkWindow;
export const releaseSlot = room.releaseSlot;
