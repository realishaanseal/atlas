import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { getServices } from '@/firebase/app';
import { paths } from '@/firebase/paths';
import { ROOM_ID } from '@/config';
import type { EncryptedEnvelope, KdfDoc, KdfParams, ParticipantId, RoomDoc } from '@/types';
import { AppError } from '@/utils/result';

/**
 * Room bootstrap and device pairing.
 *
 * The room document holds the two device slots as fields rather than as a
 * `devices` collection. Security Rules cannot count a collection cheaply, so
 * making the cap structural — two fields, no third to write — is what enforces
 * "exactly two devices" without an expensive rule.
 */

export interface RoomState {
  readonly exists: boolean;
  readonly slot: ParticipantId | null;
  readonly bothSlotsTaken: boolean;
  readonly repairOpen: boolean;
}

export async function readRoom(): Promise<RoomState> {
  const { db, auth } = getServices();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new AppError('unknown', 'Not signed in');

  const snapshot = await getDoc(doc(db, paths.room()));
  if (!snapshot.exists()) {
    return { exists: false, slot: null, bothSlotsTaken: false, repairOpen: false };
  }

  const data = snapshot.data() as RoomDoc;
  const slot: ParticipantId | null =
    data.deviceA === uid ? 'a' : data.deviceB === uid ? 'b' : null;

  return {
    exists: true,
    slot,
    bothSlotsTaken: data.deviceA !== null && data.deviceB !== null,
    repairOpen: data.repairUntil > Date.now(),
  };
}

/** Creates the room and claims slot A. Only ever succeeds once. */
export async function createRoom(): Promise<ParticipantId> {
  const { db, auth } = getServices();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new AppError('unknown', 'Not signed in');

  await setDoc(doc(db, paths.room()), {
    schemaVersion: 1,
    createdAt: Date.now(),
    deviceA: uid,
    deviceB: null,
    repairUntil: 0,
  } satisfies RoomDoc);

  return 'a';
}

/**
 * Claims a free slot, or takes one over if a re-pair window is open.
 *
 * Runs in a transaction because both devices may arrive at once and the
 * read-then-write would otherwise race, leaving one uid in both slots. Rules
 * reject that outcome too, but failing here gives a better error.
 */
export async function claimSlot(): Promise<ParticipantId> {
  const { db, auth } = getServices();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new AppError('unknown', 'Not signed in');

  const ref = doc(db, paths.room());

  return runTransaction(db, async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists()) throw new AppError('unknown', 'Room does not exist');

    const data = snapshot.data() as RoomDoc;

    if (data.deviceA === uid) return 'a';
    if (data.deviceB === uid) return 'b';

    if (data.deviceA === null) {
      tx.update(ref, { deviceA: uid });
      return 'a';
    }
    if (data.deviceB === null) {
      tx.update(ref, { deviceB: uid });
      return 'b';
    }

    // Both taken. Only a re-pair window opened from a paired device allows a
    // takeover; otherwise this is a third device and must be refused.
    if (data.repairUntil > Date.now()) {
      tx.update(ref, { deviceB: uid, repairUntil: 0 });
      return 'b';
    }

    throw new AppError('device-not-paired');
  });
}

/** Opens a 5-minute window during which a new device may take a slot. */
export async function openRepairWindow(): Promise<void> {
  const { db } = getServices();
  await updateDoc(doc(db, paths.room()), { repairUntil: Date.now() + 5 * 60 * 1000 });
}

/** Releases this device's own slot. */
export async function releaseSlot(slot: ParticipantId): Promise<void> {
  const { db } = getServices();
  await updateDoc(doc(db, paths.room()), { [slot === 'a' ? 'deviceA' : 'deviceB']: null });
}

// --- key derivation parameters ---------------------------------------------

export async function readKdf(): Promise<KdfDoc | null> {
  const { db } = getServices();
  const snapshot = await getDoc(doc(db, paths.kdf()));
  return snapshot.exists() ? (snapshot.data() as KdfDoc) : null;
}

/** Writes the salt and verifier. Rules make this immutable afterwards. */
export async function writeKdf(
  params: KdfParams,
  verifier: EncryptedEnvelope,
): Promise<void> {
  const { db } = getServices();
  await setDoc(doc(db, paths.kdf()), {
    v: 1,
    algorithm: 'PBKDF2',
    hash: 'SHA-256',
    iterations: params.iterations,
    salt: params.salt,
    verifier,
    createdAt: Date.now(),
  } satisfies KdfDoc);
}

export { ROOM_ID, serverTimestamp };
