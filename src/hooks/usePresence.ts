import { useCallback, useEffect, useRef, useState } from 'react';
import * as kv from '@/storage/db';
import type { ParticipantId } from '@/types';
import type { PeerPresence, PresenceWriter } from '@/services/presence';

const OFFLINE: PeerPresence = { online: false, lastSeen: 0, typing: false };

/** Where the manual last-seen is remembered between sessions, per device. */
const OVERRIDE_KEY = 'last-seen-override';

export function usePresence(slot: ParticipantId, uid: string) {
  const [peer, setPeer] = useState<PeerPresence>(OFFLINE);
  const writerRef = useRef<PresenceWriter | null>(null);

  /** Manually chosen last-seen shown to the peer, or null for normal presence. */
  const [lastSeenOverride, setLastSeenOverrideState] = useState<number | null>(null);
  const overrideRef = useRef<number | null>(null);

  useEffect(() => {
    let unwatch: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      /**
       * The saved override is read BEFORE the writer starts, deliberately.
       *
       * Loading it in a parallel effect meant the heartbeat could fire first and
       * publish a genuine `online: true` for the few milliseconds until the
       * value arrived — a live snapshot on the other side would have caught it.
       * Reading first costs one await and closes that window completely.
       */
      const stored = await kv.get<number>(OVERRIDE_KEY);
      if (cancelled) return;

      if (typeof stored === 'number') {
        overrideRef.current = stored;
        setLastSeenOverrideState(stored);
      }

      const service = await import('@/services/presence');
      if (cancelled) return;

      const writer = new service.PresenceWriter(slot, uid);
      if (overrideRef.current !== null) writer.setLastSeenOverride(overrideRef.current);
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

  /**
   * Sets (or clears, with null) the last-seen time the peer is shown.
   *
   * Takes effect immediately — the writer republishes rather than waiting for
   * the next 45-second heartbeat — and persists, so it survives a reload.
   */
  const setLastSeenOverride = useCallback((value: number | null) => {
    overrideRef.current = value;
    setLastSeenOverrideState(value);
    writerRef.current?.setLastSeenOverride(value);
    if (value === null) void kv.remove(OVERRIDE_KEY);
    else void kv.set(OVERRIDE_KEY, value);
  }, []);

  return {
    peer,
    lastSeenOverride,
    setLastSeenOverride,
    noteTyping: () => {
      writerRef.current?.noteTyping();
    },
    clearTyping: () => {
      writerRef.current?.clearTyping();
    },
  };
}
