import { useCallback, useEffect, useState } from 'react';
import * as kv from '@/storage/db';

/**
 * The personal "quick-react" preset: a set of emoji applied to a message all at
 * once from a single button.
 *
 * Local to this device, like emoji favourites — a shortcut, not shared state,
 * and there is no reason to write your reaction habits into the database. Each
 * value is either a Unicode emoji or `custom:<id>`, the same shape a reaction
 * takes, so the button can hand the list straight to the reaction write.
 */

const KEY = 'bulk-reactions';
export const BULK_MAX = 10;

export function useBulkReactions() {
  const [emojis, setEmojis] = useState<string[]>([]);

  useEffect(() => {
    void (async () => {
      const stored = await kv.get<string[]>(KEY);
      if (Array.isArray(stored)) setEmojis(stored.slice(0, BULK_MAX));
    })();
  }, []);

  const toggle = useCallback((value: string) => {
    setEmojis((prev) => {
      const next = prev.includes(value)
        ? prev.filter((e) => e !== value)
        : prev.length >= BULK_MAX
          ? prev // at the cap — ignore rather than silently dropping another
          : [...prev, value];
      void kv.set(KEY, next);
      return next;
    });
  }, []);

  const remove = useCallback((value: string) => {
    setEmojis((prev) => {
      const next = prev.filter((e) => e !== value);
      void kv.set(KEY, next);
      return next;
    });
  }, []);

  return { emojis, toggle, remove, max: BULK_MAX };
}
