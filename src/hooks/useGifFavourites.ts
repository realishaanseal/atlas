import { useCallback, useEffect, useRef, useState } from 'react';
import * as db from '@/storage/db';
import type { GifResult } from '@/services/gifs';

const KEY = 'gif-favourites';
export const MAX_GIF_FAVOURITES = 24;
/** Locally-stored GIFs hold real bytes, so they get a tighter cap. */
export const MAX_LOCAL_FAVOURITES = 10;

/**
 * A favourite is either a Giphy reference or a GIF we hold the bytes for.
 *
 * The second kind exists so a GIF that arrived in the conversation — dragged
 * in, pasted, or sent by the other person — can be saved. Those never had a
 * Giphy URL to point at, so the only way to keep them is to keep the file.
 */
export type GifFavourite =
  | ({ kind: 'giphy' } & GifResult)
  | {
      kind: 'local';
      id: string;
      data: Uint8Array;
      width: number;
      height: number;
      description: string;
    };

/** Content hash, so saving the same GIF twice does not duplicate it. */
export async function hashBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest).slice(0, 12))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Favourite GIFs, stored locally.
 *
 * For Giphy entries the whole record is stored rather than just an id — the
 * API needs a search to resolve an id back into URLs, and a favourites list
 * that requires a network round trip to render would defeat the point.
 *
 * Local rather than synced, like emoji favourites: a personal shortcut, and
 * syncing it would write your GIF habits into the database for no benefit.
 */
export function useGifFavourites() {
  const [favourites, setFavourites] = useState<GifFavourite[]>([]);

  /**
   * Mirror of `favourites` for computing the next list.
   *
   * The writes used to happen INSIDE a `setFavourites` updater. That is not
   * safe: React treats updaters as pure and may call one twice (StrictMode) or
   * throw its result away and re-run it. A database write hidden in there is
   * therefore neither guaranteed to happen once nor guaranteed to happen at
   * all. Deriving from a ref keeps the updater pure and the write explicit.
   */
  const ref = useRef<GifFavourite[]>([]);

  const commit = useCallback((next: GifFavourite[]) => {
    ref.current = next;
    setFavourites(next);
    db.set(KEY, next).catch((error: unknown) => {
      // Previously swallowed by `void`, which is why this bug was invisible.
      console.error('Could not save GIF favourites', error);
    });
  }, []);

  useEffect(() => {
    void (async () => {
      const stored = (await db.get<GifFavourite[]>(KEY)) ?? [];
      ref.current = stored;
      setFavourites(stored);
    })();
  }, []);

  const toggleGiphy = useCallback(
    (gif: GifResult) => {
      const current = ref.current;
      commit(
        current.some((g) => g.id === gif.id)
          ? current.filter((g) => g.id !== gif.id)
          : [{ kind: 'giphy' as const, ...gif }, ...current].slice(0, MAX_GIF_FAVOURITES),
      );
    },
    [commit],
  );

  /** Saves a GIF we hold the bytes for — one from the conversation. */
  const toggleLocal = useCallback(
    async (bytes: Uint8Array, width: number, height: number, description = 'GIF') => {
      const id = await hashBytes(bytes);
      const current = ref.current;

      if (current.some((g) => g.id === id)) {
        commit(current.filter((g) => g.id !== id));
        return id;
      }

      const locals = current.filter((g) => g.kind === 'local');
      const trimmed =
        locals.length >= MAX_LOCAL_FAVOURITES
          ? current.filter((g) => g.id !== locals.at(-1)?.id)
          : current;

      const entry: GifFavourite = {
        kind: 'local',
        // A plain copy: `bytes` may be a view onto a larger buffer, and
        // structured clone would store the whole underlying buffer.
        data: new Uint8Array(bytes),
        id,
        width,
        height,
        description,
      };

      commit([entry, ...trimmed].slice(0, MAX_GIF_FAVOURITES));
      return id;
    },
    [commit],
  );

  const persist = commit;

  const isFavourite = useCallback(
    (id: string) => favourites.some((g) => g.id === id),
    [favourites],
  );

  /** Whether a set of bytes is already saved. Used by the in-chat star. */
  const isFavouriteBytes = useCallback(
    async (bytes: Uint8Array) => {
      const id = await hashBytes(bytes);
      return favourites.some((g) => g.id === id);
    },
    [favourites],
  );

  return { favourites, toggleGiphy, toggleLocal, isFavourite, isFavouriteBytes, persist };
}
