import { useEffect, useRef, useState } from 'react';
import { SmilePlus, MoreHorizontal, Zap } from 'lucide-react';
import { EmojiPicker } from './EmojiPicker';
import { ReactionGlyph } from './EmojiText';
import { useEmojiFavourites } from '@/hooks/useEmojiFavourites';
import { useCustomEmoji } from '@/hooks/useCustomEmoji';
import type { ParticipantId } from '@/types';
import { cn } from '@/utils/cn';

interface ReactionRowProps {
  reactions: Partial<Record<ParticipantId, string[]>>;
  mySlot: ParticipantId;
  mine: boolean;
  onToggle: (emoji: string) => void;
}

/**
 * Reaction chips beneath a message, grouped by emoji with a count.
 *
 * Grouping is what makes a shared reaction feel shared: if you both pick 😂
 * you get one chip reading "😂 2" rather than two identical chips sitting next
 * to each other.
 *
 * Clicking any chip toggles YOUR reaction — joining one your friend started,
 * or leaving one you already gave. It never modifies their entry, which is
 * also exactly what the Security Rules permit.
 */
export function ReactionRow({ reactions, mySlot, mine, onToggle }: ReactionRowProps) {
  const { byId } = useCustomEmoji();

  /**
   * A reaction value is either a literal Unicode emoji or `custom:<id>`.
   *
   * This needed no change to storage or Security Rules: reactions were already
   * an encrypted array of strings, and the rules validate the envelope rather
   * than reading inside it. So a custom reference is just another string.
   */
  const describe = (value: string): string => {
    if (!value.startsWith('custom:')) return value;
    const emoji = byId.get(value.slice('custom:'.length));
    return emoji ? `:${emoji.name}:` : 'a deleted emoji';
  };

  // Preserve first-seen order rather than sorting, so chips do not jump around
  // as counts change.
  const grouped = new Map<string, { count: number; includesMe: boolean }>();

  for (const slot of ['a', 'b'] as const) {
    for (const emoji of reactions[slot] ?? []) {
      const entry = grouped.get(emoji) ?? { count: 0, includesMe: false };
      entry.count += 1;
      if (slot === mySlot) entry.includesMe = true;
      grouped.set(emoji, entry);
    }
  }

  if (grouped.size === 0) return null;

  return (
    // `relative z-10` is load-bearing. The pill deliberately overlaps the
    // bubble's bottom edge via negative margin, and without a stacking order
    // the NEXT message — a later sibling — paints on top of it.
    <div
      className={cn(
        'relative z-10 -mt-2.5 flex px-1',
        mine ? 'justify-end pr-2.5' : 'justify-start pl-2.5',
      )}
    >
      {/* One pill holding every reaction, rather than a chip each.
          Separate chips read as unrelated objects; a single container reads as
          "the reactions on this message", and it stops a row of them sprawling
          across the width of the bubble.

          Solid rather than glass: this sits over a bubble edge, and a
          translucent surface against a gradient reads as a smudge. */}
      <div
        className={cn(
          'flex max-w-[17rem] flex-wrap items-center gap-1 rounded-2xl border border-border',
          'bg-surface-raised px-1.5 py-1 shadow-lift',
          mine ? 'justify-end' : 'justify-start',
        )}
      >
        {[...grouped.entries()].map(([emoji, { count, includesMe }]) => (
          <button
            key={emoji}
            type="button"
            onClick={() => {
              onToggle(emoji);
            }}
            aria-label={
              includesMe
                ? `Remove your ${describe(emoji)} reaction`
                : `React ${describe(emoji)}, ${String(count)} so far`
            }
            aria-pressed={includesMe}
            className={cn(
              'flex items-center gap-1 rounded-full px-2.5 py-1 text-base leading-none',
              // No entry animation and only a slight hover growth: chips sit
              // close together in a shared pill, so anything bigger overlaps
              // its neighbours instead of reading as emphasis.
              'transition-transform duration-150 ease-spring hover:scale-110',
              // Your own reactions get a tinted backing rather than a border —
              // inside a shared pill a per-emoji border would fight the
              // container's own outline.
              includesMe && 'bg-accent-solid/35',
            )}
          >
            <ReactionGlyph value={emoji} size={22} />
            {count > 1 && (
              <span className={cn('tabular-nums', includesMe ? 'text-white' : 'text-secondary')}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

interface ReactionPickerProps {
  mine: boolean;
  current: string[];
  onPick: (emoji: string) => void;
  onClose: () => void;
  /** Opens the "more actions" menu (copy/pin/edit). The touch entry point. */
  onMore?: () => void;
  /** Applies the quick-react preset in one tap. Absent when none is configured. */
  onBulk?: () => void;
  bulkCount?: number;
}

/**
 * Quick-reaction strip: your five favourites, plus a button that opens the
 * full searchable picker.
 *
 * Favourites are local rather than synced — a personal shortcut, not shared
 * state, and syncing them would write your emoji habits into the database for
 * no benefit.
 */
export function ReactionPicker({
  mine,
  current,
  onPick,
  onClose,
  onMore,
  onBulk,
  bulkCount,
}: ReactionPickerProps) {
  const [fullOpen, setFullOpen] = useState(false);
  const { favourites } = useEmojiFavourites();
  const { emojis } = useCustomEmoji();
  const rootRef = useRef<HTMLDivElement | null>(null);

  const quickCustom = [...emojis]
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 3);

  /**
   * Stays open until a click lands outside it.
   *
   * The listener is attached on the next tick rather than immediately — the
   * very click that opened this picker is still propagating, and registering
   * synchronously would catch it and close the picker in the same gesture.
   *
   * Disabled entirely once the full picker takes over. Otherwise this handler
   * stays mounted while `rootRef` points at a div that no longer renders —
   * `contains()` on a null ref is false, so every click counts as "outside"
   * and the panel closes the instant you touch its search box.
   */
  useEffect(() => {
    if (fullOpen) return;

    const attach = setTimeout(() => {
      document.addEventListener('pointerdown', onPointerDown);
    }, 0);

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(attach);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose, fullOpen]);

  if (fullOpen) {
    return (
      <EmojiPicker
        align={mine ? 'right' : 'left'}
        onPick={(emoji) => {
          setFullOpen(false);
          onPick(emoji);
        }}
        // Reactions store the stable id, not the shortcode, so a rename or a
        // duplicate name cannot change what an existing reaction points at.
        onPickCustom={({ id }) => {
          setFullOpen(false);
          onPick(`custom:${id}`);
        }}
        onClose={onClose}
      />
    );
  }

  return (
    // On desktop the picker sits above and OUTSIDE the bubble — over the react
    // button, on the left of your own messages and the right of theirs — so it
    // never covers the message you are reacting to.
    //
    // Below `sm` it falls back to aligning with the bubble edge: there is no
    // hover on touch, the picker opens on long-press, and pushing a 240px
    // panel outside the bubble would run it off a phone screen.
    <div
      ref={rootRef}
      className={cn(
        'glass animate-scale-in stagger absolute bottom-full z-30 mb-1 flex items-center',
        // Tighter on phones. The full strip is ten controls wide, which
        // overflowed a 412px screen and had to be scrolled sideways to reach
        // the custom emoji — so on small screens it shows fewer, smaller ones
        // (see the `hidden sm:flex` on the extras below) and everything fits.
        'gap-0.5 rounded-full border border-border px-1.5 py-1 shadow-lift',
        'sm:gap-1 sm:px-2 sm:py-1.5',
        // Anchored on the side nearest the bubble so it grows OUTWARD into the
        // empty space, never back over the message: right-anchored for your own
        // (right-aligned) messages, left-anchored for the other person's.
        mine ? 'right-0 sm:right-full sm:mr-1' : 'left-0 sm:left-full sm:ml-1',
      )}
    >
      {favourites.map((emoji, index) => (
        <button
          key={emoji}
          type="button"
          onClick={() => {
            onPick(emoji);
          }}
          aria-label={`React ${emoji}`}
          aria-pressed={current.includes(emoji)}
          className={cn(
            'flex size-9 items-center justify-center rounded-full text-xl sm:size-10 sm:text-2xl',
            'transition-transform duration-150 ease-spring hover:scale-125',
            // Three favourites on a phone, five on a wider screen.
            index >= 3 && 'hidden sm:flex',
            current.includes(emoji) && 'bg-accent-solid/30',
          )}
        >
          {emoji}
        </button>
      ))}

      {/* The three most recently added custom emoji, inline with the Unicode
          favourites. A newly uploaded emoji is the one you most want to use, so
          recency beats alphabetical here — unlike the manager, which sorts by
          name because there you are looking something up. */}
      {quickCustom.length > 0 && (
        <span className="mx-px h-5 w-px bg-border sm:mx-0.5 sm:h-6" aria-hidden />
      )}
      {quickCustom.map((emoji, index) => (
        <button
          key={emoji.id}
          type="button"
          onClick={() => {
            onPick(`custom:${emoji.id}`);
          }}
          aria-label={`React :${emoji.name}:`}
          aria-pressed={current.includes(`custom:${emoji.id}`)}
          className={cn(
            'flex size-9 items-center justify-center rounded-full sm:size-10',
            'transition-transform duration-150 ease-spring hover:scale-125',
            // One custom emoji on a phone, three on a wider screen. The rest
            // are a tap away in the full picker.
            index >= 1 && 'hidden sm:flex',
            current.includes(`custom:${emoji.id}`) && 'bg-accent-solid/30',
          )}
        >
          <img src={emoji.url} alt="" aria-hidden className="size-6 object-contain sm:size-7" />
        </button>
      ))}

      <span className="mx-px h-5 w-px bg-border sm:mx-0.5 sm:h-6" aria-hidden />

      <button
        type="button"
        onClick={() => {
          setFullOpen(true);
        }}
        aria-label="Choose another emoji"
        className="press flex size-9 items-center justify-center rounded-full text-secondary
                   hover:bg-surface-raised hover:text-accent sm:size-10"
      >
        <SmilePlus size={18} aria-hidden />
      </button>

      {/* Quick-react: apply the whole preset at once. Same action as the ⚡ in
          the desktop hover bar, surfaced here for touch. */}
      {onBulk && (bulkCount ?? 0) > 0 && (
        <button
          type="button"
          onClick={() => {
            onBulk();
            onClose();
          }}
          aria-label={`Quick-react with ${String(bulkCount)} emoji`}
          className="press flex size-9 items-center justify-center rounded-full text-secondary
                     hover:bg-surface-raised hover:text-accent sm:size-10"
        >
          <Zap size={18} aria-hidden />
        </button>
      )}

      {/* Touch entry point into the more-actions menu (copy/pin/edit). On
          desktop those live in the ⋯ button beside reply and react; on touch
          there is no hover bar, so the picker carries the handoff. */}
      {onMore && (
        <>
          <span className="mx-px h-5 w-px bg-border sm:mx-0.5 sm:h-6" aria-hidden />
          <button
            type="button"
            onClick={() => {
              onMore();
              onClose();
            }}
            aria-label="More actions"
            className="press flex size-9 items-center justify-center rounded-full text-secondary
                       hover:bg-surface-raised hover:text-accent sm:size-10"
          >
            <MoreHorizontal size={18} aria-hidden />
          </button>
        </>
      )}
    </div>
  );
}
