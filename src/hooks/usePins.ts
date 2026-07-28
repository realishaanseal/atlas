import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PINS } from '@/config';
import { maskSpoilers } from '@/utils/spoiler';
import type { Message, Pin } from '@/types';

/**
 * The shared pin list, plus the pinned messages themselves.
 *
 * Subscribed once here and passed down, rather than each bubble holding its own
 * copy — the lesson from GIF favourites, where independent hook instances never
 * agreed. Both the pin panel and every bubble read the same set.
 *
 * `pinnedMessages` is the full message documents for the pins, fetched by id.
 * A pin older than the live 50-message window is no longer carried by the main
 * subscription, but its document still exists (its expiry was pushed out while
 * pinned) — fetching it keeps it in the timeline and jumpable however old it is.
 *
 * Toggles are optimistic: a pin that lagged behind the click would feel broken,
 * and the next server snapshot corrects any write that failed.
 */
export function usePins(key: CryptoKey) {
  const [pins, setPins] = useState<Pin[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);

  /** Message ids we have optimistically added or removed, pending the echo. */
  const optimistic = useRef(new Map<string, Pin | null>());

  const applyOptimistic = useCallback((list: Pin[]): Pin[] => {
    const byId = new Map(list.map((p) => [p.messageId, p]));
    for (const [id, value] of optimistic.current) {
      if (value === null) byId.delete(id);
      else byId.set(id, value);
    }
    return [...byId.values()].sort((a, b) => b.pinnedAt - a.pinnedAt);
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      const service = await import('@/services/pins');
      if (cancelled) return;
      unsubscribe = service.subscribe(key, (incoming) => {
        for (const [id, value] of optimistic.current) {
          const present = incoming.some((p) => p.messageId === id);
          if ((value === null && !present) || (value !== null && present)) {
            optimistic.current.delete(id);
          }
        }
        setPins(applyOptimistic(incoming));
      });
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [key, applyOptimistic]);

  const pinnedIds = useMemo(() => new Set(pins.map((p) => p.messageId)), [pins]);

  // Fetch the full message documents for the current pins. Keyed on the sorted
  // id list so it only re-runs when the SET of pins changes, not on every
  // pinnedAt reshuffle.
  const idKey = useMemo(() => [...pinnedIds].sort().join(','), [pinnedIds]);

  useEffect(() => {
    if (idKey.length === 0) {
      setPinnedMessages([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const [messages, pins] = await Promise.all([
        import('@/services/messages'),
        import('@/services/pins'),
      ]);
      const fetched = await messages.fetchByIds(key, idKey.split(','));
      if (cancelled) return;
      setPinnedMessages(fetched);

      // Self-heal: any pinned message still on its original 24h expiry (its
      // extension failed, or it was pinned before the rules allowing it went
      // live) gets re-extended now, while it is still alive. Already-extended
      // ones are skipped, so this normally does no writes.
      for (const message of fetched) {
        if (message.expiresAt < PINS.KEEP_UNTIL) {
          void pins.keepAlive(message).catch(() => {
            // Rules may still be undeployed; nothing more to do here.
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, idKey]);

  const togglePin = useCallback(
    (message: Message) => {
      const already = pins.some((p) => p.messageId === message.id);

      if (!already && pins.length >= PINS.MAX_COUNT) {
        return {
          ok: false as const,
          reason: `You can pin up to ${String(PINS.MAX_COUNT)} messages.`,
        };
      }

      void (async () => {
        const service = await import('@/services/pins');
        const media = service.mediaRef(message);
        if (already) {
          optimistic.current.set(message.id, null);
          setPins((current) => current.filter((p) => p.messageId !== message.id));
          try {
            await service.unpin({
              messageId: message.id,
              createdAt: message.createdAt,
              ...(media ? { media } : {}),
            });
          } catch {
            // The next snapshot restores it.
          }
        } else {
          const preview =
            message.payload.kind === 'text'
              ? maskSpoilers(message.payload.text).slice(0, PINS.PREVIEW_LENGTH)
              : message.payload.kind === 'image'
                ? message.payload.mime === 'image/gif'
                  ? 'GIF'
                  : 'Photo'
                : message.payload.kind === 'video'
                  ? 'Video'
                  : message.payload.kind === 'audio'
                    ? 'Voice message'
                    : 'Call';

          const entry: Pin = {
            messageId: message.id,
            sender: message.sender,
            kind: message.payload.kind,
            createdAt: message.createdAt,
            preview,
            pinnedAt: Date.now(),
            ...(message.payload.kind === 'text'
              ? { text: message.payload.text.slice(0, PINS.MAX_TEXT) }
              : {}),
            ...(media ? { media } : {}),
          };
          optimistic.current.set(message.id, entry);
          setPins((current) => [entry, ...current].sort((a, b) => b.pinnedAt - a.pinnedAt));
          try {
            await service.pin(key, message);
          } catch {
            // The next snapshot removes it.
          }
        }
      })();

      return { ok: true as const };
    },
    [key, pins],
  );

  /** Unpin from the panel, where only the Pin (not the message) is at hand. */
  const unpin = useCallback((entry: Pin) => {
    optimistic.current.set(entry.messageId, null);
    setPins((current) => current.filter((p) => p.messageId !== entry.messageId));
    void (async () => {
      const service = await import('@/services/pins');
      try {
        await service.unpin({
          messageId: entry.messageId,
          createdAt: entry.createdAt,
          ...(entry.media ? { media: entry.media } : {}),
        });
      } catch {
        // The next snapshot restores it.
      }
    })();
  }, []);

  return { pins, pinnedIds, pinnedMessages, togglePin, unpin };
}
