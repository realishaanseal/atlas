import { useCallback, useEffect, useRef, useState } from 'react';
import { REACTIONS, SWEEP_INTERVAL_MS } from '@/config';
import type { ConnectionState, Message, MessagePayload, ParticipantId } from '@/types';

/**
 * The message list, plus send and read-receipt behaviour.
 *
 * Optimistic sends: a message appears in the list immediately with state
 * 'pending', is persisted to the outbox, then written. When the server echo
 * arrives through the subscription it replaces the optimistic entry by id.
 * If the write fails the entry stays, marked 'failed', and is retried on
 * reconnect rather than being silently dropped.
 */
export function useMessages(key: CryptoKey, slot: ParticipantId) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const pendingRef = useRef<Map<string, Message>>(new Map());

  const merge = useCallback((serverMessages: Message[]) => {
    for (const message of serverMessages) {
      pendingRef.current.delete(message.id);
    }
    const pending = [...pendingRef.current.values()];
    setMessages([...serverMessages, ...pending].sort((a, b) => a.createdAt - b.createdAt));
  }, []);

  // Live subscription.
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      const { subscribe } = await import('@/services/messages');
      if (cancelled) return;

      unsubscribe = subscribe(
        key,
        ({ messages: incoming, fromCache }) => {
          merge(incoming);
          setConnection(fromCache ? 'reconnecting' : 'online');
        },
        () => {
          setConnection('offline');
        },
      );
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [key, merge]);

  // Flush anything the outbox is still holding from a previous session.
  useEffect(() => {
    void (async () => {
      const [outbox, service] = await Promise.all([
        import('@/storage/outbox'),
        import('@/services/messages'),
      ]);
      await outbox.prune();
      for (const entry of await outbox.all()) {
        try {
          await service.commit(entry, slot);
          await outbox.remove(entry.id);
        } catch {
          // Still offline. It stays queued for the next attempt.
        }
      }
    })();
  }, [slot, connection]);

  // Retention sweep: on connect, then every 10 minutes.
  useEffect(() => {
    const run = () => {
      void (async () => {
        try {
          const { sweep } = await import('@/services/messages');
          await sweep();
        } catch {
          // Best effort. A failed sweep is not worth surfacing — the documents
          // are unreadable either way, and the next pass will retry.
        }
      })();
    };

    run();
    const timer = setInterval(run, SWEEP_INTERVAL_MS);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const send = useCallback(
    async (payload: MessagePayload, retentionMs?: number) => {
      const [service, outbox] = await Promise.all([
        import('@/services/messages'),
        import('@/storage/outbox'),
      ]);

      const prepared = await service.prepare(key, payload, retentionMs);

      const optimistic: Message = {
        id: prepared.id,
        sender: slot,
        createdAt: prepared.createdAt,
        expiresAt: prepared.expiresAt,
        payload,
        reactions: {},
        state: 'pending',
      };
      pendingRef.current.set(prepared.id, optimistic);
      setMessages((prev) => [...prev, optimistic]);

      await outbox.add(prepared);

      try {
        await service.commit(prepared, slot);
        await outbox.remove(prepared.id);
      } catch {
        pendingRef.current.set(prepared.id, { ...optimistic, state: 'failed' });
        setMessages((prev) =>
          prev.map((m) => (m.id === prepared.id ? { ...m, state: 'failed' as const } : m)),
        );
      }
    },
    [key, slot],
  );

  /**
   * Confirms receipt of the peer's messages.
   *
   * Runs on every snapshot and does NOT wait for the tab to be visible — that
   * is the whole point: "delivered" must mean their device has it, while
   * "read" waits until they are actually looking. Already-stamped messages are
   * skipped, so this is one extra write per incoming message and nothing more.
   *
   * Failures are swallowed individually: an offline or already-written receipt
   * must never disrupt the message list.
   */
  const stampedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const pending = messages.filter(
      (m) => m.sender !== slot && m.deliveredAt === undefined && !stampedRef.current.has(m.id),
    );
    if (pending.length === 0) return;

    // Marked before the write resolves so a second snapshot arriving mid-flight
    // does not queue the same receipt twice.
    for (const message of pending) stampedRef.current.add(message.id);

    void (async () => {
      const { markDelivered } = await import('@/services/messages');
      await Promise.allSettled(pending.map((m) => markDelivered(m.id)));
    })();
  }, [messages, slot]);

  /** Marks the peer's unread messages as read. Rules reject marking our own. */
  const markVisibleRead = useCallback(() => {
    void (async () => {
      const unread = messages.filter((m) => m.sender !== slot && m.readAt === undefined);
      if (unread.length === 0) return;
      const { markRead } = await import('@/services/messages');
      await Promise.allSettled(unread.map((m) => markRead(m.id)));
    })();
  }, [messages, slot]);

  /**
   * Toggles one emoji in our own reaction list.
   *
   * Optimistic, because a reaction that lags behind the tap feels broken — and
   * if the write fails, the next server snapshot simply corrects it.
   *
   * Only our own slot is ever touched. Clicking a chip your friend created
   * adds the same emoji to YOUR list, which is what makes the count go to two,
   * rather than modifying anything of theirs.
   */
  const react = useCallback(
    async (messageId: string, emoji: string) => {
      let nextList: string[] = [];

      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;

          const current = m.reactions[slot] ?? [];
          nextList = current.includes(emoji)
            ? current.filter((e) => e !== emoji)
            : [...current, emoji];

          // Rebuilt by filtering rather than `delete` on a computed key —
          // dynamic delete deoptimises the object's hidden class in V8, and
          // this runs on every reaction tap.
          const reactions =
            nextList.length === 0
              ? Object.fromEntries(Object.entries(m.reactions).filter(([key]) => key !== slot))
              : { ...m.reactions, [slot]: nextList };

          return { ...m, reactions };
        }),
      );

      try {
        const { react: sendReaction } = await import('@/services/messages');
        await sendReaction(key, messageId, slot, nextList);
      } catch {
        // The next server snapshot overwrites the optimistic value.
      }
    },
    [key, slot],
  );

  /**
   * Applies a whole preset of emoji to a message in one write — the "quick
   * react" button.
   *
   * Additive: the preset is unioned with whatever we have already reacted with,
   * preset first so it always lands in full, then capped. The cap keeps the
   * encrypted reaction list under the 512-byte envelope the rules allow (~11
   * custom references); anything past that is dropped rather than risking a
   * rejected write.
   */
  const bulkReact = useCallback(
    async (messageId: string, preset: string[]) => {
      if (preset.length === 0) return;
      let nextList: string[] = [];

      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const current = m.reactions[slot] ?? [];
          // Same cap the write applies, from the same constant — so the
          // optimistic list always equals what gets stored, with no flicker.
          nextList = [...new Set([...preset, ...current])].slice(0, REACTIONS.MAX_PER_PERSON);
          return { ...m, reactions: { ...m.reactions, [slot]: nextList } };
        }),
      );

      try {
        const { react: sendReaction } = await import('@/services/messages');
        await sendReaction(key, messageId, slot, nextList);
      } catch {
        // The next server snapshot corrects the optimistic value.
      }
    },
    [key, slot],
  );

  /**
   * Edits our own text message.
   *
   * Optimistic: the new text shows immediately, with the original captured on
   * the first edit so the history is right. A failed write is corrected by the
   * next snapshot. Only our own text messages are editable; the caller gates
   * the affordance, and the rules enforce it regardless.
   */
  const edit = useCallback(
    (message: Message, newText: string) => {
      const trimmed = newText.trim();
      if (message.payload.kind !== 'text' || message.sender !== slot) return;
      if (trimmed.length === 0 || trimmed === message.payload.text) return;

      const firstEdit = message.editedAt === undefined;

      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== message.id || m.payload.kind !== 'text') return m;
          return {
            ...m,
            payload: { ...m.payload, text: trimmed },
            editedAt: Date.now(),
            // Capture the pre-edit text as the original, once.
            ...(firstEdit ? { originalText: m.payload.text } : {}),
          };
        }),
      );

      void (async () => {
        try {
          const { editMessage } = await import('@/services/messages');
          await editMessage(key, message, trimmed);
        } catch {
          // The next server snapshot restores the true state.
        }
      })();
    },
    [key, slot],
  );

  /** Writes a message dated in the future; delivery no longer needs this device. */
  const scheduleMessage = useCallback(
    async (payload: MessagePayload, deliverAt: number) => {
      const { schedule } = await import('@/services/messages');
      await schedule(key, payload, slot, deliverAt);
    },
    [key, slot],
  );

  /** Cancels one of our own not-yet-delivered scheduled messages. */
  const cancelScheduled = useCallback(async (messageId: string) => {
    const { cancelScheduled: cancel } = await import('@/services/messages');
    await cancel(messageId);
  }, []);

  return {
    messages,
    connection,
    send,
    markVisibleRead,
    react,
    bulkReact,
    edit,
    scheduleMessage,
    cancelScheduled,
  };
}
