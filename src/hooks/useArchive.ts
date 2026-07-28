import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as kv from '@/storage/db';
import type { ArchiveStats } from '@/services/archive';
import type { Message, ParticipantId } from '@/types';

/**
 * The local chat archive, wired to the live message list.
 *
 * Strictly an A-side feature: for any other slot every effect below is inert,
 * so the B device never captures, never exports, and the UI never offers it.
 *
 * Capture is debounced — messages arrive in bursts, and each run re-reads the
 * archive to dedupe — but always fires within the 24h window while the media
 * documents still exist, which is the only hard timing constraint.
 */

const ENABLED_KEY = 'archive-enabled';
const CAPTURE_DEBOUNCE_MS = 3000;

export function useArchive(key: CryptoKey, slot: ParticipantId, messages: Message[]) {
  const isArchivist = slot === 'a';

  const [enabled, setEnabled] = useState(true);
  const [stats, setStats] = useState<ArchiveStats | null>(null);
  const [exporting, setExporting] = useState(false);

  const capturingRef = useRef(false);
  const rerunRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // The latest messages, read at capture time. Kept in a ref so runCapture does
  // not need `messages` as a dependency — otherwise it would be recreated (and
  // the debounce reset) on every 15s clock tick, not just when something is said.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Fires the effect only on real content change — new message, edit, reaction —
  // rather than whenever the delivered-messages array is rebuilt by the clock.
  const contentSignature = useMemo(
    () =>
      messages
        .map(
          (m) =>
            `${m.id}:${String(m.editedAt ?? '')}:${String(m.reactions.a?.length ?? 0)}.${String(m.reactions.b?.length ?? 0)}`,
        )
        .join('|'),
    [messages],
  );

  const refreshStats = useCallback(() => {
    void (async () => {
      const { stats: read } = await import('@/services/archive');
      setStats(await read());
    })();
  }, []);

  // Load the saved on/off choice and initial figures. Ask for persistent
  // storage so the browser will not evict the memory under disk pressure.
  useEffect(() => {
    if (!isArchivist) return;
    void (async () => {
      const saved = await kv.get<boolean>(ENABLED_KEY);
      if (saved === false) setEnabled(false);
      if (typeof navigator !== 'undefined') {
        await navigator.storage?.persist?.().catch(() => false);
      }
      refreshStats();
    })();
  }, [isArchivist, refreshStats]);

  // Snapshot the emoji pack once per session, so shortcodes still render in the
  // export even if an emoji is later deleted.
  useEffect(() => {
    if (!isArchivist || !enabled) return;
    void (async () => {
      try {
        const { captureEmoji } = await import('@/services/archive');
        await captureEmoji(key);
      } catch {
        // Best effort — a missing emoji only degrades the export cosmetically.
      }
    })();
  }, [isArchivist, enabled, key]);

  const runCapture = useCallback(() => {
    if (capturingRef.current) {
      rerunRef.current = true;
      return;
    }
    capturingRef.current = true;
    void (async () => {
      try {
        const { captureMessages } = await import('@/services/archive');
        const changed = await captureMessages(key, messagesRef.current);
        if (changed > 0) refreshStats();
      } catch {
        // Capture is best effort; the next burst retries.
      } finally {
        capturingRef.current = false;
        if (rerunRef.current) {
          rerunRef.current = false;
          runCapture();
        }
      }
    })();
  }, [key, refreshStats]);

  useEffect(() => {
    if (!isArchivist || !enabled || contentSignature === '') return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(runCapture, CAPTURE_DEBOUNCE_MS);
    return () => {
      clearTimeout(timerRef.current);
    };
  }, [isArchivist, enabled, contentSignature, runCapture]);

  const toggle = useCallback(() => {
    setEnabled((previous) => {
      const next = !previous;
      void kv.set(ENABLED_KEY, next);
      return next;
    });
  }, []);

  const exportNow = useCallback(
    (peerName: string) => {
      if (!isArchivist) return;
      setExporting(true);
      void (async () => {
        try {
          const [{ captureEmoji, readArchive }, { downloadHtmlExport }] = await Promise.all([
            import('@/services/archive'),
            import('@/services/archiveExport'),
          ]);
          // Fold in any emoji not yet snapshotted, then build from the full store.
          await captureEmoji(key).catch(() => undefined);
          const snapshot = await readArchive();
          downloadHtmlExport(snapshot, { mySlot: slot, peerName });
        } finally {
          setExporting(false);
        }
      })();
    },
    [isArchivist, key, slot],
  );

  const clear = useCallback(() => {
    void (async () => {
      const { clear: wipe } = await import('@/services/archive');
      await wipe();
      refreshStats();
    })();
  }, [refreshStats]);

  return { enabled, stats, exporting, toggle, exportNow, clear, refreshStats, isArchivist };
}
