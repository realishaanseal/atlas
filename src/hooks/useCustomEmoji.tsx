import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import * as service from '@/services/emojis';
import type { CustomEmoji } from '@/types';

/**
 * The shared custom emoji pack.
 *
 * Deliberately a CONTEXT rather than a plain hook, and that is the lesson from
 * the GIF favourites: that hook holds its own state per call site, so a star
 * clicked in a message bubble and the star shown in the picker were two
 * unrelated pieces of state that never agreed. Emoji are read in far more
 * places — every message, every reaction chip, the composer autocomplete, the
 * picker — so there is exactly one copy here, and every consumer sees the same
 * one update at the same time.
 *
 * It also means the decrypted bytes and their object URLs are created once per
 * emoji rather than once per rendered instance. A conversation showing the same
 * emoji forty times holds one blob, not forty.
 */

interface EmojiStore {
  readonly emojis: CustomEmoji[];
  readonly byName: ReadonlyMap<string, CustomEmoji>;
  readonly byId: ReadonlyMap<string, CustomEmoji>;
  readonly loading: boolean;
  readonly add: (file: File, name: string) => Promise<void>;
  readonly remove: (id: string) => Promise<void>;
  readonly refresh: () => Promise<void>;
}

const EmojiContext = createContext<EmojiStore | null>(null);

export function CustomEmojiProvider({
  cryptoKey,
  children,
}: {
  cryptoKey: CryptoKey;
  children: ReactNode;
}) {
  const [emojis, setEmojis] = useState<CustomEmoji[]>([]);
  const [loading, setLoading] = useState(true);

  /**
   * Object URLs currently handed out, so they can be revoked when replaced.
   *
   * Without this every refresh would leak a blob per emoji — invisible until
   * the tab has been open a while, then noticeable. Held in a ref rather than
   * state because revoking is cleanup, not something the UI renders.
   */
  const urlsRef = useRef<string[]>([]);

  const applyPack = useCallback((decrypted: service.DecryptedEmoji[]) => {
    for (const url of urlsRef.current) URL.revokeObjectURL(url);

    const created: string[] = [];
    const next = decrypted.map((entry): CustomEmoji => {
      const url = URL.createObjectURL(new Blob([entry.bytes], { type: entry.mime }));
      created.push(url);
      return {
        id: entry.id,
        name: entry.name,
        mime: entry.mime,
        width: entry.width,
        height: entry.height,
        url,
        createdAt: entry.createdAt,
        byteSize: entry.bytes.length,
      };
    });

    urlsRef.current = created;
    setEmojis(next);
  }, []);

  const refresh = useCallback(async () => {
    try {
      applyPack(await service.loadAll(cryptoKey));
    } catch (error) {
      console.error('Could not load custom emoji', error);
    } finally {
      setLoading(false);
    }
  }, [cryptoKey, applyPack]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Revoke everything on unmount — i.e. on lock. Decrypted emoji should not
  // outlive the session that decrypted them.
  useEffect(
    () => () => {
      for (const url of urlsRef.current) URL.revokeObjectURL(url);
      urlsRef.current = [];
    },
    [],
  );

  const add = useCallback(
    async (file: File, name: string) => {
      await service.upload(cryptoKey, file, name);
      await refresh();
    },
    [cryptoKey, refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await service.remove(id);
      await refresh();
    },
    [refresh],
  );

  const value = useMemo<EmojiStore>(() => {
    const byName = new Map<string, CustomEmoji>();
    const byId = new Map<string, CustomEmoji>();
    for (const emoji of emojis) {
      // First writer wins on a duplicate name. Both people can add the same
      // shortcode independently — there is no uniqueness constraint the rules
      // could enforce — and picking one deterministically is better than
      // rendering whichever happened to sort last.
      if (!byName.has(emoji.name)) byName.set(emoji.name, emoji);
      byId.set(emoji.id, emoji);
    }
    return { emojis, byName, byId, loading, add, remove, refresh };
  }, [emojis, loading, add, remove, refresh]);

  return <EmojiContext.Provider value={value}>{children}</EmojiContext.Provider>;
}

/**
 * Reads the pack.
 *
 * Returns an empty store rather than throwing when there is no provider, so
 * components that render both inside and outside an unlocked session (or in
 * tests) do not need to care.
 */
// The provider and its reader belong together — splitting them across files to
// satisfy fast refresh would mean every consumer imports from two places to use
// one thing. The cost is that editing this file does a full reload in dev.
// eslint-disable-next-line react-refresh/only-export-components
export function useCustomEmoji(): EmojiStore {
  return (
    useContext(EmojiContext) ?? {
      emojis: [],
      byName: new Map(),
      byId: new Map(),
      loading: false,
      add: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      refresh: () => Promise.resolve(),
    }
  );
}
