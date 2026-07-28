import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { EMOJI } from '@/config';
import { useCustomEmoji } from '@/hooks/useCustomEmoji';
import { useMentionNames } from '@/hooks/useMentionNames';
import { cn } from '@/utils/cn';
import type { ParticipantId } from '@/types';

/**
 * Message text with light Markdown, plus custom emoji and spoilers.
 *
 * Supported, matching Discord's subset:
 *   # / ## / ###␠text   headings (the trailing space is required)
 *   - text  or  * text  bullet list
 *   `code`               inline code, rendered verbatim (no emoji/spoiler inside)
 *   ||spoiler||          hidden until clicked
 *   :shortcode:          custom emoji
 *
 * A message that is nothing but emoji still renders jumbo, as before.
 *
 * Nothing here interpolates into markup — every leaf is a React text node or a
 * validated emoji name, so there is no HTML-injection surface.
 */

const CUSTOM_EMOJI_NAME = /[a-z0-9_]{2,32}/;

/**
 * One inline token, in precedence order: code / spoiler / bold / italic /
 * custom emoji. Code wins, so `*x*` inside backticks stays literal; `**` is
 * tried before `*`, so `**x**` is bold rather than two italics. Emphasis and
 * spoiler contents are parsed again, so emoji (and nested emphasis) inside them
 * still render.
 */
const INLINE =
  /`([^`\n]+)`|\|\|([\s\S]+?)\|\||\*\*([\s\S]+?)\*\*|\*([^*\n]+?)\*|:([a-z0-9_]{2,32}):|<@([ab])>|((?:https?:\/\/|www\.)[^\s<]+)/g;

/** Trailing punctuation that is almost never part of the URL a person pasted. */
const URL_TRAILING = /[.,!?;:)\]}'"]+$/;

/** Unicode emoji cluster — see the jumbo check. */
const UNICODE_EMOJI =
  /\p{Extended_Pictographic}(?:️)?(?:\p{Emoji_Modifier})?(?:‍\p{Extended_Pictographic}(?:️)?)*|\p{Regional_Indicator}{2}|[0-9#*]️?⃣/gu;

type Inline =
  | { t: 'text'; v: string }
  | { t: 'code'; v: string }
  | { t: 'emoji'; name: string; url: string }
  | { t: 'mention'; slot: ParticipantId }
  | { t: 'link'; href: string; label: string }
  | { t: 'spoiler'; inner: Inline[] }
  | { t: 'bold'; inner: Inline[] }
  | { t: 'italic'; inner: Inline[] };

type Block =
  | { t: 'h'; level: 1 | 2 | 3; nodes: Inline[] }
  | { t: 'ul'; items: Inline[][] }
  | { t: 'p'; lines: Inline[][] };

type Emoji = ReadonlyMap<string, { url: string }>;

function parseInline(text: string, byName: Emoji): Inline[] {
  const out: Inline[] = [];
  let last = 0;

  for (const match of text.matchAll(INLINE)) {
    const index = match.index;
    if (index > last) out.push({ t: 'text', v: text.slice(last, index) });

    if (match[1] !== undefined) {
      out.push({ t: 'code', v: match[1] });
    } else if (match[2] !== undefined) {
      out.push({ t: 'spoiler', inner: parseInline(match[2], byName) });
    } else if (match[3] !== undefined) {
      out.push({ t: 'bold', inner: parseInline(match[3], byName) });
    } else if (match[4] !== undefined) {
      out.push({ t: 'italic', inner: parseInline(match[4], byName) });
    } else if (match[5] !== undefined) {
      const emoji = byName.get(match[5]);
      if (emoji) out.push({ t: 'emoji', name: match[5], url: emoji.url });
      else out.push({ t: 'text', v: match[0] });
    } else if (match[6] !== undefined) {
      out.push({ t: 'mention', slot: match[6] === 'a' ? 'a' : 'b' });
    } else if (match[7] !== undefined) {
      // Strip trailing punctuation so "see https://x.com." doesn't link the dot.
      // Whatever is trimmed is handed back as text via `last` below.
      const label = match[7].replace(URL_TRAILING, '');
      const href = label.startsWith('www.') ? `https://${label}` : label;
      out.push({ t: 'link', href, label });
      last = index + label.length;
      continue;
    }

    last = index + match[0].length;
  }

  if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
  return out;
}

function parseBlocks(text: string, byName: Emoji): Block[] {
  const blocks: Block[] = [];

  for (const line of text.split('\n')) {
    const heading = /^(#{1,3}) (.+)$/.exec(line);
    if (heading) {
      const level = (heading[1] ?? '').length as 1 | 2 | 3;
      blocks.push({ t: 'h', level, nodes: parseInline(heading[2] ?? '', byName) });
      continue;
    }

    const bullet = /^[-*] (.+)$/.exec(line);
    if (bullet) {
      const item = parseInline(bullet[1] ?? '', byName);
      const previous = blocks.at(-1);
      if (previous?.t === 'ul') previous.items.push(item);
      else blocks.push({ t: 'ul', items: [item] });
      continue;
    }

    const previous = blocks.at(-1);
    const nodes = parseInline(line, byName);
    if (previous?.t === 'p') previous.lines.push(nodes);
    else blocks.push({ t: 'p', lines: [nodes] });
  }

  return blocks;
}

/** True when the whole message is only emoji (plus whitespace), and how many. */
function jumboCheck(text: string, byName: Emoji): { jumbo: boolean; count: number } {
  let count = 0;
  let rest = text.replace(/\s/g, '');
  if (rest.length === 0) return { jumbo: false, count: 0 };

  rest = rest.replace(/:([a-z0-9_]{2,32}):/g, (whole, name: string) => {
    if (CUSTOM_EMOJI_NAME.test(name) && byName.has(name)) {
      count += 1;
      return '';
    }
    return whole;
  });
  rest = rest.replace(UNICODE_EMOJI, () => {
    count += 1;
    return '';
  });

  return { jumbo: rest.length === 0 && count > 0 && count <= EMOJI.JUMBO_MAX_COUNT, count };
}

/**
 * A mention chip.
 *
 * Resolves the slot to the viewer's own names: their slot reads "You" and gets
 * a stronger highlight — that is the "ping", the visual cue that this message is
 * calling you — while the other slot reads the peer's nickname.
 */
function Mention({ slot }: { slot: ParticipantId }) {
  const { mySlot, peerName } = useMentionNames();
  const isMe = slot === mySlot;

  // Only bold, with a whisper of background — the text keeps the bubble's own
  // colour so it stays readable on both the accent and surface bubbles. The
  // "you got pinged" emphasis lives in the edge bar on the message, not here.
  return (
    <span className="rounded bg-black/10 px-0.5 font-semibold">@{isMe ? 'You' : peerName}</span>
  );
}

/** Hidden text, revealed on click. */
function Spoiler({ children }: { children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        setRevealed(true);
      }}
      aria-label={revealed ? undefined : 'Hidden text, click to reveal'}
      className={cn(
        'whitespace-pre-wrap rounded px-1 align-baseline transition-colors duration-150',
        revealed
          ? 'bg-black/15'
          : 'cursor-pointer select-none bg-black/75 text-transparent hover:bg-black/85 [&_img]:opacity-0',
      )}
    >
      {children}
    </button>
  );
}

function renderInline(nodes: Inline[], size: number, keyPrefix = ''): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}${String(index)}`;
    switch (node.t) {
      case 'text':
        return <Fragment key={key}>{node.v}</Fragment>;
      case 'code':
        return (
          <code
            key={key}
            className="rounded bg-black/20 px-1 py-0.5 font-mono text-[0.85em]"
          >
            {node.v}
          </code>
        );
      case 'emoji':
        return (
          <img
            key={key}
            src={node.url}
            alt={`:${node.name}:`}
            title={`:${node.name}:`}
            className="inline-block object-contain align-text-bottom -mb-0.5"
            style={{ width: size, height: size }}
          />
        );
      case 'spoiler':
        return <Spoiler key={key}>{renderInline(node.inner, size, `${key}-`)}</Spoiler>;
      case 'bold':
        return <strong key={key}>{renderInline(node.inner, size, `${key}-`)}</strong>;
      case 'italic':
        return <em key={key}>{renderInline(node.inner, size, `${key}-`)}</em>;
      case 'mention':
        return <Mention key={key} slot={node.slot} />;
      case 'link':
        // Scheme is constrained to http(s) by the tokenizer, so there is no
        // javascript:/data: surface here. New tab, no referrer, no opener.
        return (
          <a
            key={key}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            onClick={(event) => {
              event.stopPropagation();
            }}
            className="underline decoration-1 underline-offset-2 break-all hover:opacity-80"
          >
            {node.label}
          </a>
        );
    }
  });
}

const HEADING_CLASS: Record<1 | 2 | 3, string> = {
  1: 'text-2xl font-bold leading-tight',
  2: 'text-xl font-bold leading-tight',
  3: 'text-base font-bold leading-snug',
};

const HEADING_TAG: Record<1 | 2 | 3, 'h1' | 'h2' | 'h3'> = { 1: 'h1', 2: 'h2', 3: 'h3' };

export function EmojiText({ text }: { text: string }) {
  const { byName } = useCustomEmoji();

  const parsed = useMemo(() => {
    const jumbo = jumboCheck(text, byName);
    if (jumbo.jumbo) return { kind: 'jumbo' as const, nodes: parseInline(text, byName) };
    return { kind: 'blocks' as const, blocks: parseBlocks(text, byName) };
  }, [text, byName]);

  if (parsed.kind === 'jumbo') {
    return (
      <p className="whitespace-pre-wrap break-words leading-tight" style={{ fontSize: EMOJI.JUMBO_PX }}>
        {renderInline(parsed.nodes, EMOJI.JUMBO_PX)}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {parsed.blocks.map((block, index) => {
        if (block.t === 'h') {
          const Tag = HEADING_TAG[block.level];
          return (
            <Tag key={index} className={cn('break-words', HEADING_CLASS[block.level])}>
              {renderInline(block.nodes, EMOJI.INLINE_PX, `${String(index)}-`)}
            </Tag>
          );
        }

        if (block.t === 'ul') {
          return (
            <ul key={index} className="list-disc space-y-0.5 pl-5">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className="break-words">
                  {renderInline(item, EMOJI.INLINE_PX, `${String(index)}-${String(itemIndex)}-`)}
                </li>
              ))}
            </ul>
          );
        }

        // A paragraph is its lines joined by hard breaks, so blank lines and
        // multi-line messages keep their shape.
        return (
          <p key={index} className="whitespace-pre-wrap break-words">
            {block.lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 && <br />}
                {renderInline(line, EMOJI.INLINE_PX, `${String(index)}-${String(lineIndex)}-`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
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
