import { useEffect, useRef, useState } from 'react';
import type { ParticipantId } from '@/types';
import type { PeerPresence, PresenceWriter } from '@/services/presence';

const OFFLINE: PeerPresence = { online: false, lastSeen: 0, typing: false };

export function usePresence(slot: ParticipantId, uid: string) {
  const [peer, setPeer] = useState<PeerPresence>(OFFLINE);
  const writerRef = useRef<PresenceWriter | null>(null);

  useEffect(() => {
    let unwatch: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      const service = await import('@/services/presence');
      if (cancelled) return;

      const writer = new service.PresenceWriter(slot, uid);
      writer.start();
      writerRef.current = writer;

      unwatch = service.watchPeer(slot === 'a' ? 'b' : 'a', setPeer);
    })();

    // Mark offline when the tab is hidden or closed. Not guaranteed to land —
    // browsers may kill the page first — which is exactly why the peer also
    // applies a staleness timeout rather than trusting this.
    const onHide = () => {
      if (document.visibilityState === 'hidden') void writerRef.current?.stop();
      else writerRef.current?.start();
    };
    document.addEventListener('visibilitychange', onHide);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onHide);
      unwatch?.();
      void writerRef.current?.stop();
    };
  }, [slot, uid]);

  return {
    peer,
    noteTyping: () => {
      writerRef.current?.noteTyping();
    },
    clearTyping: () => {
      writerRef.current?.clearTyping();
    },
  };
}
