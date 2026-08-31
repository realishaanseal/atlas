import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Star, Sparkles } from 'lucide-react';
import { EMOJI_CATEGORIES, parseEntry, searchEmoji } from './emojiData';
import { useEmojiFavourites } from '@/hooks/useEmojiFavourites';
import { useCustomEmoji } from '@/hooks/useCustomEmoji';
import { cn } from '@/utils/cn';

/** Sentinel for the custom-emoji tab, which sits before the Unicode categories. */
const CUSTOM_TAB = -1;

interface EmojiPickerProps {
  onPick: (emoji: string) => void;
  /**
   * Called instead of `onPick` when a custom emoji is chosen.
   *
   * Needed because the two call sites want different things from the same
   * click: the composer wants the literal text `:name:` inserted, while a
   * reaction wants the stable `custom:<id>` reference. Resolving by name at
   * reaction time would break the moment an emoji was renamed or a duplicate
   * name appeared. Callers that omit this get `:name:` inserted via `onPick`.
   */
  onPickCustom?: (value: { id: string; name: string }) => void;
  onClose: () => void;
  /** Anchors the panel; reaction pickers open near the message, not the composer. */
  align?: 'left' | 'right';
  className?: string;
}

/**
 * Emoji picker with search and favourites.
 *
 * Right-clicking (or long-pressing) an emoji toggles it as a favourite, which
 * is what populates the quick row in the reaction picker. Discoverability of
 * that is admittedly poor, so the footer says so outright rather than relying
 * on people guessing.
 */
export function EmojiPicker({
  onPick,
  onPickCustom,
  onClose,
  align = 'right',
  className,
}: EmojiPickerProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { favourites, toggleFavourite } = useEmojiFavourites();
  const { emojis } = useCustomEmoji();

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const searching = query.trim().length > 0;

  const visible = useMemo(() => {
    if (searching) return searchEmoji(query);
    if (category === CUSTOM_TAB) return [];
    return (EMOJI_CATEGORIES[category]?.entries ?? []).map((entry) => parseEntry(entry).emoji);
  }, [searching, query, category]);

  /**
   * Custom emoji shown alongside the Unicode set.
   *
   * When searching, matches are listed FIRST. Someone typing "parrot" who has
   * uploaded `:party_parrot:` almost certainly means theirs, not the standard
   * bird — a custom emoji was added deliberately, so it earns the top slot.
   */
  const customVisible = useMemo(() => {
    if (searching) {
      const needle = query.trim().toLowerCase().replace(/:/g, '');
      return emojis.filter((emoji) => emoji.name.includes(needle));
    }
    return category === CUSTOM_TAB ? emojis : [];
  }, [searching, query, category, emojis]);

  const nothingToShow = visible.length === 0 && customVisible.length === 0;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label="Choose an emoji"
      className={cn(
        'animate-scale-in absolute z-30 w-[min(22rem,84vw)] overflow-hidden rounded-md',
        // Near-opaque, not glass: this panel is a dense grid of glyphs and
        // sits over message bubbles. At normal glass opacity the content
        // behind reads through it as ghosting.
        'border border-hairline bg-surface/95 shadow-raised backdrop-blur-xl',
        // Opens UPWARD by default. Every anchor for this picker — the composer
        // and the reaction bar — sits near the bottom of the screen, so
        // downward is off-screen. Callers can override via className.
        'bottom-full mb-2',
        align === 'right' ? 'right-0' : 'left-0',
        className,
      )}
    >
      <div className="border-b border-hairline p-2">
        <div className="relative">
          <Search
            size={14}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            placeholder="Search emoji"
            aria-label="Search emoji"
            className="h-9 w-full rounded-sm border border-hairline bg-surface/70 pl-8 pr-3
                       text-base text-text placeholder:text-muted focus:border-accent
                       focus:outline-none"
          />
        </div>
      </div>

      {!searching && (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-hairline px-2 py-1.5">
          {/* Custom sits first, ahead of the Unicode categories — it is the
              shortest list and the one most likely to be wanted. Hidden
              entirely when the pack is empty rather than showing a dead tab. */}
          {emojis.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setCategory(CUSTOM_TAB);
              }}
              aria-label="Custom emoji"
              aria-pressed={category === CUSTOM_TAB}
              className={cn(
                'press flex size-8 shrink-0 items-center justify-center rounded-sm',
                category === CUSTOM_TAB
                  ? 'bg-accent-solid/25 text-accent'
                  : 'text-secondary hover:bg-surface-raised',
              )}
            >
              <Sparkles size={15} aria-hidden />
            </button>
          )}

          {EMOJI_CATEGORIES.map((entry, index) => (
            <button
              key={entry.name}
              type="button"
              onClick={() => {
                setCategory(index);
              }}
              aria-label={entry.name}
              aria-pressed={category === index}
              className={cn(
                'press flex size-8 shrink-0 items-center justify-center rounded-sm text-base',
                category === index ? 'bg-accent-solid/25' : 'hover:bg-surface-raised',
              )}
            >
              {entry.icon}
            </button>
          ))}
        </div>
      )}

      <div className="grid max-h-52 grid-cols-8 gap-0.5 overflow-y-auto p-2">
        {customVisible.map((emoji) => (
          <button
            key={emoji.id}
            type="button"
            onClick={() => {
              if (onPickCustom) onPickCustom({ id: emoji.id, name: emoji.name });
              else onPick(`:${emoji.name}:`);
            }}
            title={`:${emoji.name}:`}
            className="flex size-9 items-center justify-center rounded-sm transition-transform
                       duration-150 ease-spring hover:scale-125 hover:bg-surface-raised"
          >
            <img src={emoji.url} alt={`:${emoji.name}:`} className="size-6 object-contain" />
          </button>
        ))}

        {visible.map((emoji, index) => {
          const isFavourite = favourites.includes(emoji);
          return (
            <button
              key={`${emoji}-${String(index)}`}
              type="button"
              onClick={() => {
                onPick(emoji);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                toggleFavourite(emoji);
              }}
              title={isFavourite ? 'Right-click to unfavourite' : 'Right-click to favourite'}
              className={cn(
                'relative flex size-9 items-center justify-center rounded-sm text-xl',
                'transition-transform duration-150 ease-spring hover:scale-125',
                'hover:bg-surface-raised',
              )}
            >
              {emoji}
              {isFavourite && (
                <Star
                  size={8}
                  aria-hidden
                  className="absolute right-0.5 top-0.5 fill-accent text-accent"
                />
              )}
            </button>
          );
        })}
        {nothingToShow && (
          <p className="col-span-8 py-6 text-center text-xs text-muted">
            {category === CUSTOM_TAB && !searching
              ? 'No custom emoji yet. Add some in Settings.'
              : 'No emoji found.'}
          </p>
        )}
      </div>

      <p className="border-t border-hairline px-3 py-1.5 text-[0.625rem] text-muted">
        Right-click an emoji to pin it to your quick reactions.
      </p>
    </div>
  );
}
