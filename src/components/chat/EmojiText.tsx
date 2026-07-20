import { Fragment, useMemo } from 'react';
import { EMOJI } from '@/config';
import { useCustomEmoji } from '@/hooks/useCustomEmoji';
import { cn } from '@/utils/cn';

/**
 * Message text with `:shortcode:` spans replaced by custom emoji images.
 *
 * The parse is deliberately conservative. The pattern matches the same grammar
 * upload enforces — lowercase, digits, underscore, 2–32 characters — so a colon
 * used in ordinary writing ("12:30", "note: this") cannot accidentally start an
 * emoji, and an unknown shortcode is left as literal text rather than silently
 * vanishing.
 *
 * Nothing here interpolates into markup. React escapes the text nodes, and the
 * only value that reaches an attribute is the name, which is re-validated
 * against the same pattern when the pack is decrypted.
 */

const SHORTCODE = /:([a-z0-9_]{2,32}):/g;

type Piece =
  | { kind: 'text'; value: string }
  | { kind: 'emoji'; name: string; url: string };

export function EmojiText({ text }: { text: string }) {
  const { byName } = useCustomEmoji();

  const { pieces, jumbo } = useMemo(() => {
    const parsed: Piece[] = [];
    let lastIndex = 0;
    let emojiCount = 0;
    let sawText = false;

    // `matchAll` rather than a stateful `exec` loop: the regex is module-level
    // and has the `g` flag, so a shared `lastIndex` across calls would make
    // rendering order-dependent.
    for (const match of text.matchAll(SHORTCODE)) {
      // The capture group is guaranteed by the pattern, but the compiler cannot
      // know that and `noUncheckedIndexedAccess` is on — so this is checked
      // rather than asserted away with `!`.
      const name = match[1];
      if (name === undefined) continue;

      const emoji = byName.get(name);
      const index = match.index;

      if (!emoji) continue;

      if (index > lastIndex) {
        const between = text.slice(lastIndex, index);
        parsed.push({ kind: 'text', value: between });
        if (between.trim().length > 0) sawText = true;
      }

      parsed.push({ kind: 'emoji', name, url: emoji.url });
      emojiCount += 1;
      lastIndex = index + match[0].length;
    }

    if (lastIndex < text.length) {
      const tail = text.slice(lastIndex);
      parsed.push({ kind: 'text', value: tail });
      if (tail.trim().length > 0) sawText = true;
    }

    /**
     * A message that is nothing but custom emoji renders large, the way Discord
     * and iMessage do. Capped, because forty jumbo emoji is a wall rather than
     * an expression.
     */
    return {
      pieces: parsed,
      jumbo: !sawText && emojiCount > 0 && emojiCount <= EMOJI.JUMBO_MAX_COUNT,
    };
  }, [text, byName]);

  const size = jumbo ? EMOJI.JUMBO_PX : EMOJI.INLINE_PX;

  return (
    <p className={cn('whitespace-pre-wrap break-words', jumbo && 'leading-none')}>
      {pieces.map((piece, index) =>
        piece.kind === 'text' ? (
          <Fragment key={index}>{piece.value}</Fragment>
        ) : (
          <img
            key={index}
            src={piece.url}
            alt={`:${piece.name}:`}
            title={`:${piece.name}:`}
            width={size}
            height={size}
            // `inline-block` with a slight negative offset sits the glyph on
            // the text baseline. Plain `inline` leaves it hanging below.
            className={cn(
              'inline-block object-contain align-text-bottom',
              jumbo ? 'mx-0.5' : '-mb-0.5',
            )}
            style={{ width: size, height: size }}
          />
        ),
      )}
    </p>
  );
}

/**
 * Renders one emoji reference for a reaction chip.
 *
 * A reaction is either a literal Unicode emoji or `custom:<id>`. An id that no
 * longer resolves — the emoji was deleted after someone reacted with it —
 * falls back to a neutral glyph rather than an empty chip.
 */
export function ReactionGlyph({ value, size = 16 }: { value: string; size?: number }) {
  const { byId } = useCustomEmoji();

  if (!value.startsWith('custom:')) return <span>{value}</span>;

  const emoji = byId.get(value.slice('custom:'.length));
  if (!emoji) return <span className="text-muted">□</span>;

  return (
    <img
      src={emoji.url}
      alt={`:${emoji.name}:`}
      width={size}
      height={size}
      className="inline-block object-contain"
      style={{ width: size, height: size }}
    />
  );
}
