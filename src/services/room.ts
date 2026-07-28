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
    data.deviceA === uid || data.deviceA2 === uid ? 'a' : data.deviceB === uid ? 'b' : null;

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
    deviceA2: null,
    deviceB: null,
    repairUntil: 0,
    linkTarget: null,
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
    const deviceA2 = data.deviceA2 ?? null;
    const linkTarget = data.linkTarget ?? null;

    if (data.deviceA === uid || deviceA2 === uid) return 'a';
    if (data.deviceB === uid) return 'b';

    // "Add another of my own devices": an A device opened a link window, so this
    // newcomer fills the empty second A slot and joins the A side.
    //
    // The claim writes ONLY the slot, never repairUntil/linkTarget — a device
    // that is not paired yet cannot satisfy the rule that guards those two, and
    // it does not need to: the window expires on its own, and the next
    // open-window call resets the intent.
    if (linkTarget === 'a' && deviceA2 === null && data.repairUntil > Date.now()) {
      tx.update(ref, { deviceA2: uid });
      return 'a';
    }

    if (data.deviceA === null) {
      tx.update(ref, { deviceA: uid });
      return 'a';
    }
    if (data.deviceB === null) {
      tx.update(ref, { deviceB: uid });
      return 'b';
    }

    // Both taken. Only a re-pair window (NOT a link window) allows a takeover of
    // B — so "add another of my devices" can never displace the other person,
    // even if it is opened when the second A slot is already full.
    if (data.repairUntil > Date.now() && linkTarget !== 'a') {
      tx.update(ref, { deviceB: uid });
      return 'b';
    }

    throw new AppError('device-not-paired');
  });
}

/**
 * Opens a 5-minute window during which a new device may take over slot B.
 *
 * Clears any link intent, so a replace and a link do not get confused if one
 * follows the other.
 */
export async function openRepairWindow(): Promise<void> {
  const { db } = getServices();
  await updateDoc(doc(db, paths.room()), {
    repairUntil: Date.now() + 5 * 60 * 1000,
    linkTarget: null,
  });
}

/**
 * Opens a 5-minute window during which the next device to join fills the empty
 * second A slot — adding one of your own devices without displacing anyone.
 */
export async function openLinkWindow(): Promise<void> {
  const { db } = getServices();
  await updateDoc(doc(db, paths.room()), {
    repairUntil: Date.now() + 5 * 60 * 1000,
    linkTarget: 'a',
  });
}

/**
 * Releases this device's own slot.
 *
 * Determines which field actually holds this uid rather than trusting the slot
 * letter — a second A device reports slot 'a' but occupies `deviceA2`, so
 * clearing `deviceA` would both fail the rules and unpair the wrong device.
 */
export async function releaseSlot(): Promise<void> {
  const { db, auth } = getServices();
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  const snapshot = await getDoc(doc(db, paths.room()));
  if (!snapshot.exists()) return;
  const data = snapshot.data() as RoomDoc;

  const field =
    data.deviceA === uid
      ? 'deviceA'
      : data.deviceA2 === uid
        ? 'deviceA2'
        : data.deviceB === uid
          ? 'deviceB'
          : null;
  if (field === null) return;

  await updateDoc(doc(db, paths.room()), { [field]: null });
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
