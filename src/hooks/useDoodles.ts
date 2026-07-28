import { useCallback, useEffect, useState } from 'react';
import type { Doodle, DoodleStroke } from '@/types';

/**
 * The shared doodle layer.
 *
 * Subscribed once and passed down. Saving is optimistic-free — a doodle is a
 * deliberate action with a visible spinner-less delay of a single write, and the
 * live subscription reflects it a moment later, so there is no flicker worth
 * pre-empting.
 */
export function useDoodles(key: CryptoKey) {
  const [doodles, setDoodles] = useState<Doodle[]>([]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      const service = await import('@/services/doodles');
      if (cancelled) return;
      unsubscribe = service.subscribe(key, setDoodles);
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [key]);

  const save = useCallback(
    async (anchorId: string, strokes: DoodleStroke[]) => {
      const service = await import('@/services/doodles');
      await service.save(key, anchorId, strokes);
    },
    [key],
  );

  const erase = useCallback(async (id: string) => {
    const service = await import('@/services/doodles');
    await service.erase(id);
  }, []);

  return { doodles, save, erase };
}
