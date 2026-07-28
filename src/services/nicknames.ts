import { deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { getServices } from '@/firebase/app';
import { paths } from '@/firebase/paths';
import { encryptJson, decryptJson } from '@/crypto';
import type { NicknameDoc, ParticipantId } from '@/types';

/**
 * Publishing and reading the nickname one person gave the other.
 *
 * This is the single, deliberate exception to nicknames being on-device only
 * (see usePeerName). A document at nicknames/{slot} holds the label whoever
 * occupies that slot gave their peer — encrypted, so no plaintext name ever
 * lands in the database — and only that slot's holder may write it.
 *
 * The name is re-clamped after decrypt for the same reason the emoji pack is:
 * decryption proves the value came from someone with the key, not that it is a
 * sane 32-character label rather than something crafted to break the header
 * layout.
 */

const MAX_NAME = 32;

/** Live subscription to what the given slot's holder calls their peer. */
export function subscribeNickname(
  key: CryptoKey,
  slot: ParticipantId,
  onName: (name: string | null) => void,
): () => void {
  const { db } = getServices();
  return onSnapshot(
    doc(db, paths.nickname(slot)),
    (snapshot) => {
      const data = snapshot.data() as NicknameDoc | undefined;
      if (!data?.name) {
        onName(null);
        return;
      }
      void decryptJson<string>(key, data.name)
        .then((name) => {
          onName(typeof name === 'string' && name.length > 0 ? name.slice(0, MAX_NAME) : null);
        })
        .catch(() => {
          // An unreadable nickname is simply "not set" — never surface an error
          // for a purely cosmetic label.
          onName(null);
        });
    },
    () => {
      onName(null);
    },
  );
}

/**
 * Publishes (or, for an empty name, clears) this slot's label for its peer.
 *
 * Callers gate WHICH slot ever calls this — that is where the app's one-way
 * behaviour lives. The rules allow either slot to write its own document; the
 * client is what declines to.
 */
export async function publishNickname(
  key: CryptoKey,
  slot: ParticipantId,
  name: string,
): Promise<void> {
  const { db } = getServices();
  const ref = doc(db, paths.nickname(slot));

  const trimmed = name.trim().slice(0, MAX_NAME);
  if (trimmed.length === 0) {
    await deleteDoc(ref);
    return;
  }

  const document: NicknameDoc = {
    name: await encryptJson(key, trimmed),
    updatedAt: Date.now(),
  };
  await setDoc(ref, document);
}
