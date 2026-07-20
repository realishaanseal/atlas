import { useRef, useState } from 'react';
import {
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  CornerUpLeft,
  Image as ImageIcon,
  Mic,
  SmilePlus,
} from 'lucide-react';
import { ImageBubble } from './ImageBubble';
import { AudioBubble } from './AudioBubble';
import { ReactionRow, ReactionPicker } from './ReactionRow';
import { EmojiText } from './EmojiText';
import { CallLogEntry } from './CallLogEntry';
import { useSwipeToReply } from '@/hooks/useSwipeToReply';
import type { Message, ParticipantId } from '@/types';
import type { Position } from '@/utils/messageGroups';
import { cn } from '@/utils/cn';

interface BubbleProps {
  message: Message;
  mine: boolean;
  mySlot: ParticipantId;
  position: Position;
  cryptoKey: CryptoKey;
  onOpenImage: (url: string) => void;
  onReply: (message: Message) => void;
  onReact: (message: Message, emoji: string) => void;
  onJumpTo: (messageId: string) => void;
  highlighted: boolean;
}

function timeLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * Delivery state, rendered inside our own (accent-coloured) bubble.
 *
 * Colour alone must not carry meaning here — the bubble is already accent
 * blue, so an accent-blue "read" tick is literally invisible against it. The
 * distinction is carried by the glyph (one check vs two) and by opacity.
 */
function StateIcon({ state }: { state: Message['state'] }) {
  switch (state) {
    case 'pending':
      return <Clock size={12} className="opacity-70" aria-label="Sending" />;
    case 'failed':
      return <AlertCircle size={13} className="text-white" aria-label="Failed to send" />;
    case 'read':
      return <CheckCheck size={14} className="text-white" aria-label="Read" />;
    default:
      return <Check size={13} className="opacity-70" aria-label="Sent" />;
  }
}

/**
 * Corner radii encode position in a group. The "tail" corner is only squared
 * on the last message of a run, so a block reads as one continuous shape.
 */
function cornerClasses(mine: boolean, position: Position): string {
  if (mine) {
    switch (position) {
      case 'single':
      case 'first':
        return 'rounded-lg rounded-br-xs';
      case 'middle':
        return 'rounded-lg rounded-r-xs';
      case 'last':
        return 'rounded-lg rounded-tr-xs';
    }
  }
  switch (position) {
    case 'single':
    case 'first':
      return 'rounded-lg rounded-bl-xs';
    case 'middle':
      return 'rounded-lg rounded-l-xs';
    case 'last':
      return 'rounded-lg rounded-tl-xs';
  }
}

/**
 * Quote of the message being replied to.
 *
 * Clicking it jumps to the original. If that message has already expired and
 * been swept there is nothing to jump to — the quote still renders, because
 * the excerpt was snapshotted at send time, but the jump quietly does nothing
 * rather than erroring.
 */
function ReplyQuote({
  reply,
  mine,
  onJump,
}: {
  reply: NonNullable<Message['payload']['replyTo']>;
  mine: boolean;
  onJump: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onJump(reply.id);
      }}
      className={cn(
        'mb-1.5 flex w-full items-center gap-1.5 rounded-sm border-l-2 py-1 pl-2 pr-2 text-left text-xs',
        'transition-opacity duration-150 hover:opacity-80',
        mine
          ? 'border-white/60 bg-white/10 text-white/85'
          : 'border-accent bg-accent/10 text-secondary',
      )}
    >
      {reply.kind === 'image' && <ImageIcon size={12} className="shrink-0" aria-hidden />}
      {reply.kind === 'audio' && <Mic size={12} className="shrink-0" aria-hidden />}
      <span className="truncate">{reply.preview}</span>
    </button>
  );
}

export function Bubble({
  message,
  mine,
  mySlot,
  position,
  cryptoKey,
  onOpenImage,
  onReply,
  onReact,
  onJumpTo,
  highlighted,
}: BubbleProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const swipe = useSwipeToReply(() => {
    onReply(message);
  });

  const isImage = message.payload.kind === 'image';
  const isAudio = message.payload.kind === 'audio';

  // Call records are events, not messages — no reply, no reactions, no bubble.
  if (message.payload.kind === 'call') {
    return <CallLogEntry message={message} payload={message.payload} mine={mine} />;
  }
  const showMeta = position === 'single' || position === 'last';
  const myReactions = message.reactions[mySlot] ?? [];

  const toggleReaction = (emoji: string) => {
    setPickerOpen(false);
    onReact(message, emoji);
  };

  return (
    // `group` sits on the full-width row so the hover zone is the whole strip
    // beside the message, not just the bubble itself — moving toward the
    // controls from anywhere on that line keeps them alive.
    <div
      id={`msg-${message.id}`}
      className={cn(
        'group relative flex w-full items-center scroll-mt-20',
        mine ? 'justify-end' : 'justify-start',
        position === 'single' || position === 'first' ? 'mt-2' : 'mt-0.5',
        // The whole row lifts while its picker is open. Without this, the
        // picker is stacked correctly *within* this row but still loses to the
        // next message, which is a later sibling in the list.
        pickerOpen ? 'z-40' : 'z-0',
        // Brief flash when jumped to from a reply quote.
        highlighted && 'animate-pulse',
      )}
    >
      {/* Reply affordance revealed by the swipe. Fades in with distance so it
          appears to emerge from under the bubble. */}
      {swipe.swiping && (
        <span
          aria-hidden
          className={cn(
            'absolute left-0 flex size-8 items-center justify-center rounded-full',
            swipe.armed ? 'bg-accent-solid text-white' : 'bg-surface-raised text-secondary',
          )}
          style={{ opacity: Math.min(1, swipe.offset / 40) }}
        >
          <CornerUpLeft size={15} />
        </span>
      )}

      <div className="relative flex max-w-[min(78%,34rem)] flex-col">
        {/* Desktop hover controls.
            Positioned against the bubble column, not the full-width row —
            anchoring to the row put them at the window edge with a dead gap
            in between, so the hover dropped before the pointer arrived.
            The px-1 padding bridges the gap so the hover survives the
            journey. Hidden on touch, where swipe and long-press do these
            jobs without occupying space. */}
        <div
          className={cn(
            'absolute top-1/2 z-10 hidden -translate-y-1/2 items-center',
            'gap-0.5 px-1 transition-opacity duration-150 sm:flex',
            // Pinned visible while the picker is open — otherwise moving the
            // mouse off the message hides the very button the picker is
            // anchored to, and the panel appears to float free.
            pickerOpen
              ? 'pointer-events-auto opacity-100'
              : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100',
            mine ? 'right-full' : 'left-full',
          )}
        >
          <button
            type="button"
            onClick={() => {
              onReply(message);
            }}
            aria-label="Reply"
            className="press flex size-8 items-center justify-center rounded-full text-muted
                       hover:bg-surface-raised hover:text-accent"
          >
            <CornerUpLeft size={15} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => {
              setPickerOpen((open) => !open);
            }}
            aria-label="React"
            className="press flex size-8 items-center justify-center rounded-full text-muted
                       hover:bg-surface-raised hover:text-accent"
          >
            <SmilePlus size={15} aria-hidden />
          </button>
        </div>

        {pickerOpen && (
          <ReactionPicker
            mine={mine}
            current={myReactions}
            onPick={toggleReaction}
            onClose={() => {
              setPickerOpen(false);
            }}
          />
        )}

        <div
          role="listitem"
          {...swipe.handlers}
          onContextMenu={(event) => {
            event.preventDefault();
            setPickerOpen(true);
          }}
          onTouchStart={() => {
            longPressTimer.current = setTimeout(() => {
              setPickerOpen(true);
            }, 500);
          }}
          onTouchEnd={() => {
            if (longPressTimer.current) clearTimeout(longPressTimer.current);
          }}
          className={cn(
            'animate-bubble-in relative overflow-hidden',
            'text-[0.9375rem] leading-relaxed',
            cornerClasses(mine, position),
            isImage ? '' : isAudio ? 'w-[min(78vw,17rem)] px-3 py-2' : 'px-4 py-2.5',
            mine
              ? cn(
                  'text-white',
                  isImage
                    ? ''
                    : 'bg-gradient-to-b from-accent-solid to-accent-solid-deep shadow-glow',
                )
              : cn(
                  'text-text',
                  isImage ? '' : 'border border-border bg-surface/80 backdrop-blur-sm shadow-soft',
                ),
          )}
          style={{
            transform: swipe.offset > 0 ? `translateX(${String(swipe.offset)}px)` : undefined,
            transition: swipe.swiping ? 'none' : 'transform 220ms var(--ease-spring)',
            touchAction: 'pan-y',
          }}
        >
          {message.payload.replyTo && (
            <ReplyQuote reply={message.payload.replyTo} mine={mine} onJump={onJumpTo} />
          )}

          {message.payload.kind === 'image' ? (
            <ImageBubble cryptoKey={cryptoKey} payload={message.payload} onOpen={onOpenImage} />
          ) : message.payload.kind === 'audio' ? (
            <AudioBubble cryptoKey={cryptoKey} payload={message.payload} mine={mine} />
          ) : (
            /* Rendered as text nodes, never dangerouslySetInnerHTML. React
               escapes these, which is the XSS defence — no sanitiser needed.
               EmojiText only swaps in <img> for shortcodes that resolve to an
               emoji in the pack; everything else stays literal text. */
            <EmojiText text={message.payload.text} />
          )}

          {(showMeta || isImage) && (
            <div
              className={cn(
                'flex items-center justify-end gap-1 text-[0.6875rem]',
                isImage
                  ? 'pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2.5 pb-1.5 pt-6 text-white'
                  : cn('mt-1', mine ? 'text-white/70' : 'text-muted'),
              )}
            >
              <time dateTime={new Date(message.createdAt).toISOString()}>
                {timeLabel(message.createdAt)}
              </time>
              {mine && <StateIcon state={message.state} />}
            </div>
          )}
        </div>

        <ReactionRow
          reactions={message.reactions}
          mySlot={mySlot}
          mine={mine}
          onToggle={toggleReaction}
        />
      </div>
    </div>
  );
}
