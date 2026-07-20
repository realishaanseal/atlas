import { useCallback, useEffect, useState } from 'react';
import * as db from '@/storage/db';
import type { ParticipantId } from '@/types';

/**
 * A local nickname for the other person.
 *
 * Stored on this device only, never in Firestore. Two reasons:
 *
 *   1. A name written to the database sits next to encrypted content and
 *      undoes part of the point — the server currently knows two anonymous
 *      devices exchange ciphertext, and "Priya" would change that.
 *   2. Like Discord's nicknames, it is your label for them, not their name.
 *      You each picking something different is correct behaviour.
 *
 * Defaults to "User A" / "User B" from the slot, so there is always something
 * to show before anyone sets anything.
 */
export function usePeerName(peerSlot: ParticipantId) {
  const fallback = peerSlot === 'a' ? 'User A' : 'User B';
  const key = `peer-name-${peerSlot}`;

  const [name, setName] = useState(fallback);

  useEffect(() => {
    void (async () => {
      const stored = await db.get<string>(key);
      setName(stored && stored.length > 0 ? stored : fallback);
    })();
  }, [key, fallback]);

  const rename = useCallback(
    (next: string) => {
      const trimmed = next.trim().slice(0, 32);
      if (trimmed.length === 0) {
        // Empty clears the nickname rather than storing a blank one.
        setName(fallback);
        void db.remove(key);
        return;
      }
      setName(trimmed);
      void db.set(key, trimmed);
    },
    [key, fallback],
  );

  return { name, rename, isCustom: name !== fallback };
}
