import { useCallback, useEffect, useState } from 'react';
import * as db from '@/storage/db';

const KEY = 'emoji-favourites';
export const MAX_FAVOURITES = 5;

/** Sensible starting set, replaced entirely once the user favourites anything. */
const DEFAULTS = ['❤️', '😂', '👍', '😮', '😢'] as const;

/**
 * Favourite reaction emoji, persisted locally.
 *
 * Local rather than synced: this is a personal shortcut, not shared state, and
 * syncing it would mean writing your emoji habits into the database for no
 * benefit. Your friend having different favourites is correct behaviour.
 */
export function useEmojiFavourites() {
  const [favourites, setFavourites] = useState<string[]>([...DEFAULTS]);

  useEffect(() => {
    void (async () => {
      const stored = await db.get<string[]>(KEY);
      if (stored && stored.length > 0) setFavourites(stored);
    })();
  }, []);

  const toggleFavourite = useCallback((emoji: string) => {
    setFavourites((current) => {
      const next = current.includes(emoji)
        ? current.filter((e) => e !== emoji)
        : // Newest first, oldest pushed out at the cap.
          [emoji, ...current].slice(0, MAX_FAVOURITES);

      void db.set(KEY, next);
      return next;
    });
  }, []);

  return { favourites, toggleFavourite };
}
