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

/**
 * Whether this uid holds any of the A-side slots.
 *
 * One helper rather than the same three-way comparison repeated in four places,
 * because adding deviceA3 meant every one of those places had to change and
 * missing one would have shown up as a device that unlocks but reports the wrong
 * side — which looks like a data problem rather than a missed condition.
 */
function isMineOnA(data: RoomDoc, uid: string): boolean {
  return data.deviceA === uid || data.deviceA2 === uid || data.deviceA3 === uid;
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
  const slot: ParticipantId | null = isMineOnA(data, uid)
    ? 'a'
    : data.deviceB === uid
      ? 'b'
      : null;

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
    deviceA3: null,
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
    const deviceA3 = data.deviceA3 ?? null;
    const linkTarget = data.linkTarget ?? null;

    if (isMineOnA(data, uid)) return 'a';
    if (data.deviceB === uid) return 'b';

    // "Add another of my own devices": an A device opened a link window, so this
    // newcomer fills the first empty A slot and joins the A side.
    //
    // The claim writes ONLY the slot, never repairUntil/linkTarget — a device
    // that is not paired yet cannot satisfy the rule that guards those two, and
    // it does not need to: the window expires on its own, and the next
    // open-window call resets the intent.
    if (linkTarget === 'a' && data.repairUntil > Date.now()) {
      if (deviceA2 === null) {
        tx.update(ref, { deviceA2: uid });
        return 'a';
      }
      if (deviceA3 === null) {
        tx.update(ref, { deviceA3: uid });
        return 'a';
      }
    }

    if (data.deviceA === null) {
      tx.update(ref, { deviceA: uid });
      return 'a';
    }

    /**
     * Slot B, taken whether or not it is already occupied.
     *
     * The B device browses privately, so its anonymous uid is thrown away at the
     * end of every session. Under the old rule the slot stayed pinned to a uid
     * that no longer existed on any device, which locked the other person out
     * permanently — the previous holder could not release it, because it was
     * gone.
     *
     * So this is now unconditional, and the matching relaxation lives in
     * `slotBOk` in firestore.rules. Read the comment there before changing
     * either: the two only make sense together, and the security note belongs
     * with the rule, since the rule is the part that is actually enforced.
     *
     * Note this is reached only AFTER unlock() has verified the passphrase, so
     * our own client never gets here without the key. That is a property of this
     * code path and not of the rules, which cannot check it.
     */
    tx.update(ref, { deviceB: uid });
    return 'b';
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
        : data.deviceA3 === uid
          ? 'deviceA3'
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
