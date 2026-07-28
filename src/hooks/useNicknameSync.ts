import { useCallback, useEffect, useState } from 'react';
import type { ParticipantId } from '@/types';

/**
 * The one-directional half of nicknames.
 *
 * `usePeerName` owns each person's own (on-device) label for their peer. This
 * hook adds two things on top:
 *
 *   - `theirNameForMe` — what the peer calls US, read from the peer's published
 *     nickname document. Only the A side ever shows this; on the B side the
 *     source document is never written, so it simply stays null.
 *
 *   - `publishMyNickname` — uploads OUR label so the peer can read it. This is
 *     gated to the B slot only. The A side never publishes, so its label for B
 *     stays purely on-device and there is nothing in the database for B to find.
 *     That gate is the whole feature: A can see what B calls A, but not the
 *     reverse, and B is never even aware of it.
 */
export function useNicknameSync(key: CryptoKey, mySlot: ParticipantId) {
  const peerSlot: ParticipantId = mySlot === 'a' ? 'b' : 'a';
  const [theirNameForMe, setTheirNameForMe] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      const { subscribeNickname } = await import('@/services/nicknames');
      if (cancelled) return;
      unsubscribe = subscribeNickname(key, peerSlot, (name) => {
        if (!cancelled) setTheirNameForMe(name);
      });
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [key, peerSlot]);

  const publishMyNickname = useCallback(
    (name: string) => {
      // One-way: only the B side ever uploads. See the hook doc above.
      if (mySlot !== 'b') return;
      void (async () => {
        try {
          const { publishNickname } = await import('@/services/nicknames');
          await publishNickname(key, mySlot, name);
        } catch {
          // Best effort — a cosmetic label is never worth surfacing an error.
        }
      })();
    },
    [key, mySlot],
  );

  return { theirNameForMe, publishMyNickname };
}
