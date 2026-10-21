import { useMemo, useState } from 'react';
import { m } from 'motion/react';
import { Search, X, Zap } from 'lucide-react';
import { EMOJI_CATEGORIES, parseEntry, searchEmoji } from '@/components/chat/emojiData';
import { ReactionGlyph } from '@/components/chat/EmojiText';
import { useCustomEmoji } from '@/hooks/useCustomEmoji';
import { Overlay } from '@/components/ui/Overlay';
import { springs } from '@/motion/springs';
import { cn } from '@/utils/cn';

interface BulkReactionsModalProps {
  open: boolean;
  selected: string[];
  max: number;
  onToggle: (value: string) => void;
  onRemove: (value: string) => void;
  onClose: () => void;
}

export function BulkReactionsModal({
  open,
  selected,
  max,
  onToggle,
  onRemove,
  onClose,
}: BulkReactionsModalProps) {
  const { emojis: customEmoji } = useCustomEmoji();
  const [query, setQuery] = useState('');

  const atCap = selected.length >= max;
  const isOn = (value: string) => selected.includes(value);

  // Search flattens everything into one list; otherwise show the categories.
  const unicodeResults = useMemo(() => {
    if (query.trim().length > 0) return searchEmoji(query);
    return null;
  }, [query]);

  const cell = (value: string, node: React.ReactNode, label: string) => {
    const on = isOn(value);
    return (
      <m.button
        key={value}
        type="button"
        onClick={() => {
          onToggle(value);
        }}
        disabled={!on && atCap}
        aria-pressed={on}
        aria-label={label}
        whileHover={{ scale: 1.12 }}
        whileTap={{ scale: 0.92 }}
        transition={springs.snappy}
        className={cn(
          'flex size-10 items-center justify-center rounded-md text-2xl leading-none',
          on && 'bg-accent-solid/30 ring-1 ring-accent',
          !on && atCap && 'opacity-30',
        )}
      >
        {node}
      </m.button>
    );
  };

  return (
    <Overlay
      open={open}
      onClose={onClose}
      label="Quick reactions"
      size="flex max-h-[80vh] w-[min(30rem,94vw)] flex-col"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-text">
            <Zap size={15} className="text-accent" aria-hidden />
            Quick reactions
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="press flex size-8 items-center justify-center rounded-full text-muted
                       hover:bg-surface-raised hover:text-text"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="border-b border-hairline px-4 py-3">
          <p className="mb-3 text-[0.8125rem] leading-relaxed text-secondary">
            Pick up to {max} emoji. A ⚡ button appears on every message — tapping it reacts with
            all of these at once.
          </p>

          {/* Current selection */}
          <div className="flex min-h-9 flex-wrap items-center gap-1.5">
            {selected.length === 0 ? (
              <span className="text-xs text-muted">Nothing selected yet.</span>
            ) : (
              selected.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    onRemove(value);
                  }}
                  aria-label="Remove"
                  className="press flex items-center gap-1 rounded-full border border-hairline
                             bg-surface-raised py-1 pl-2 pr-1.5 text-base leading-none hover:border-danger"
                >
                  <ReactionGlyph value={value} size={20} />
                  <X size={12} className="text-muted" aria-hidden />
                </button>
              ))
            )}
            <span className="ml-auto text-[0.6875rem] tabular-nums text-muted">
              {selected.length}/{max}
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="border-b border-hairline px-4 py-2">
          <div className="flex items-center gap-2 rounded-md bg-surface-raised px-2.5 py-1.5">
            <Search size={14} className="text-muted" aria-hidden />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              placeholder="Search emoji"
              className="w-full bg-transparent text-sm text-text placeholder:text-muted focus:outline-none"
            />
          </div>
        </div>

        {/* Grid */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {unicodeResults ? (
            <div className="grid grid-cols-8 gap-1">
              {unicodeResults.map((emoji) => cell(emoji, emoji, emoji))}
              {unicodeResults.length === 0 && (
                <p className="col-span-8 py-6 text-center text-xs text-muted">No matches.</p>
              )}
            </div>
          ) : (
            <>
              {customEmoji.length > 0 && (
                <section className="mb-3">
                  <h3 className="mb-1.5 mono text-muted">
                    Custom
                  </h3>
                  <div className="grid grid-cols-8 gap-1">
                    {customEmoji.map((emoji) =>
                      cell(
                        `custom:${emoji.id}`,
                        <img src={emoji.url} alt="" aria-hidden className="size-7 object-contain" />,
                        `:${emoji.name}:`,
                      ),
                    )}
                  </div>
                </section>
              )}

              {EMOJI_CATEGORIES.map((category) => (
                <section key={category.name} className="mb-3">
                  <h3 className="mb-1.5 mono text-muted">
                    {category.name}
                  </h3>
                  <div className="grid grid-cols-8 gap-1">
                    {category.entries.map((entry) => {
                      const { emoji } = parseEntry(entry);
                      return cell(emoji, emoji, emoji);
                    })}
                  </div>
                </section>
              ))}
            </>
          )}
        </div>
      </div>
    </Overlay>
  );
}
