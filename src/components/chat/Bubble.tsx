import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  CornerUpLeft,
  Image as ImageIcon,
  Film,
  Paperclip,
  Mic,
  MoreHorizontal,
  Pin,
  SmilePlus,
  Zap,
} from 'lucide-react';
import { maskSpoilers } from '@/utils/spoiler';
import { ImageBubble } from './ImageBubble';
import { AudioBubble } from './AudioBubble';
import { VideoBubble } from './VideoBubble';
import { FileBubble } from './FileBubble';
import { ReactionRow, ReactionPicker } from './ReactionRow';
import { MessageMenu } from './MessageMenu';
import { EmojiText } from './EmojiText';
import { CallLogEntry } from './CallLogEntry';
import { useSwipeToReply } from '@/hooks/useSwipeToReply';
import type { Message, ParticipantId } from '@/types';
import type { Position } from '@/utils/messageGroups';
import { useBackClose } from '@/hooks/useBackGuard';
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
  /** The personal quick-react preset, and the one-tap apply. Empty hides the button. */
  bulkReactions: string[];
  onBulkReact: (message: Message) => void;
  onJumpTo: (messageId: string) => void;
  onTogglePin: (message: Message) => void;
  onEdit: (message: Message, newText: string) => void;
  pinned: boolean;
  highlighted: boolean;
}

function timeLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * Delivery state, rendered inside our own (accent-coloured) bubble.
 *
 * One tick sent, two delivered, two tinted read — the convention everyone
 * already knows. The colour cannot be the usual blue: the bubble is ITSELF an
 * accent-blue gradient, so blue-on-blue would be invisible. A bright cyan reads
 * clearly against it and still says "different, and further along".
 *
 * Colour never carries the meaning alone regardless — the glyph (one check vs
 * two) and the opacity do, so the state survives being seen in greyscale.
 */
function StateIcon({ state }: { state: Message['state'] }) {
  switch (state) {
    case 'pending':
      return <Clock size={12} className="opacity-70" aria-label="Sending" />;
    case 'failed':
      return <AlertCircle size={13} className="text-white" aria-label="Failed to send" />;
    case 'read':
      return <CheckCheck size={14} className="text-cyan-300" aria-label="Read" />;
    case 'delivered':
      return <CheckCheck size={14} className="opacity-80" aria-label="Delivered" />;
    default:
      return <Check size={13} className="opacity-70" aria-label="Sent" />;
  }
}

function receiptTime(ms: number): string {
  return new Date(ms).toLocaleString([], {
    hour: 'numeric',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
  });
}

/**
 * The receipt detail, opened by tapping the tick.
 *
 * Rendered through a PORTAL with fixed positioning, not as a child of the
 * bubble. The bubble is `overflow-hidden` (it has to be — the media fills it
 * edge to edge and the ping bar hugs its rounded corners), so anything absolute
 * inside it gets clipped and buried in its stacking context. Measuring the
 * tick and painting to document.body escapes both.
 *
 * Rows appear only once they have actually happened, so the panel never shows
 * a blank "Read —" that invites you to wonder whether it failed.
 */
function ReceiptPopover({
  message,
  anchorRef,
  onClose,
}: {
  message: Message;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ right: number; bottom: number } | null>(null);

  useLayoutEffect(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Anchored to the tick's top-right, opening upward — the tick sits at the
    // bottom of the bubble, so there is room above and rarely below.
    setPos({
      right: Math.max(8, window.innerWidth - rect.right),
      bottom: Math.max(8, window.innerHeight - rect.top + 6),
    });
  }, [anchorRef]);

  // The panel is fixed, so a scroll would leave it floating away from its
  // message. Closing is honest and cheaper than tracking the anchor.
  useEffect(() => {
    const onScroll = () => {
      onClose();
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [onClose]);

  useEffect(() => {
    // Attached next tick: the click that opened this is still propagating, and
    // registering synchronously would catch it and close immediately.
    const attach = setTimeout(() => {
      document.addEventListener('pointerdown', onDown);
    }, 0);
    function onDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(attach);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const rows: { label: string; at: number; tint?: string }[] = [
    { label: 'Sent', at: message.createdAt },
    ...(message.deliveredAt !== undefined
      ? [{ label: 'Delivered', at: message.deliveredAt }]
      : []),
    ...(message.readAt !== undefined
      ? [{ label: 'Read', at: message.readAt, tint: 'text-cyan-300' }]
      : []),
  ];

  if (!pos) return null;

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-label="Message info"
      style={{ right: pos.right, bottom: pos.bottom }}
      className="glass animate-scale-in fixed z-[60] w-max min-w-[11rem] origin-bottom-right
                 rounded-md border border-border p-2.5 text-left shadow-lift"
    >
      <p className="mb-1.5 text-[0.625rem] font-medium uppercase tracking-wide text-muted">
        Message info
      </p>
      <div className="space-y-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4 text-xs">
            <span className={cn('text-secondary', row.tint)}>{row.label}</span>
            <span className="tabular-nums text-text">{receiptTime(row.at)}</span>
          </div>
        ))}
        {/* Only when genuinely undelivered. A message read on a client that
            predates delivery receipts has readAt but no deliveredAt — being
            read obviously implies it arrived, so claiming otherwise would be
            wrong. */}
        {message.deliveredAt === undefined && message.readAt === undefined && (
          <p className="pt-0.5 text-[0.625rem] leading-snug text-muted">
            Not delivered yet — waiting for their device.
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
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
      {reply.kind === 'video' && <Film size={12} className="shrink-0" aria-hidden />}
      {reply.kind === 'file' && <Paperclip size={12} className="shrink-0" aria-hidden />}
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
  bulkReactions,
  onBulkReact,
  onJumpTo,
  onTogglePin,
  onEdit,
  pinned,
  highlighted,
}: BubbleProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const tickRef = useRef<HTMLButtonElement | null>(null);
  useBackClose(pickerOpen, () => {
    setPickerOpen(false);
  });
  useBackClose(menuOpen, () => {
    setMenuOpen(false);
  });
  useBackClose(receiptOpen, () => {
    setReceiptOpen(false);
  });
  useBackClose(editing, () => {
    setEditing(false);
  });

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const swipe = useSwipeToReply(() => {
    onReply(message);
  });

  const isImage = message.payload.kind === 'image';
  const isVideo = message.payload.kind === 'video';
  const isAudio = message.payload.kind === 'audio';
  // Image and video both fill the bubble edge-to-edge, with no chrome.
  const isVisualMedia = isImage || isVideo;

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

  // Only your own text messages can be edited.
  const editable = mine && message.payload.kind === 'text';
  const messageText = message.payload.kind === 'text' ? message.payload.text : '';

  /**
   * A ping bar on the message's outer edge, Discord-style. On your own messages
   * it marks that you mentioned someone; on the other person's it marks that
   * they mentioned YOU — the received ping. Placed on the outer side: right for
   * your messages, left for theirs.
   */
  const pingBar = mine
    ? /<@[ab]>/.test(messageText)
    : messageText.includes(`<@${mySlot}>`);

  const startEdit = () => {
    setDraft(messageText);
    setEditing(true);
    setPickerOpen(false);
  };

  const saveEdit = () => {
    const next = draft.trim();
    if (next.length > 0 && next !== messageText) onEdit(message, next);
    setEditing(false);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft('');
  };

  const copyText = () => {
    if (messageText.length === 0) return;
    void navigator.clipboard?.writeText(messageText).catch(() => {
      // Clipboard can be unavailable (insecure context, denied permission).
    });
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
        // The whole row lifts while its picker or menu is open. Without this,
        // the popup is stacked correctly *within* this row but still loses to
        // the next message, which is a later sibling in the list.
        pickerOpen || menuOpen ? 'z-40' : 'z-0',
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

      {/* Wider on phones: the desktop 78% leaves a large dead margin that is
          worth trading for readable line lengths on a narrow screen, where the
          hover action bar (which needs that gutter) is not shown anyway. */}
      <div className="relative flex max-w-[min(88%,34rem)] flex-col sm:max-w-[min(78%,34rem)]">
        {/* A pinned message carries a small marker so it reads as pinned in the
            flow, not only in the bar at the top. Aligned to the bubble's own
            side. */}
        {pinned && (
          <span
            className={cn(
              'mb-0.5 flex items-center gap-1 text-[0.625rem] font-medium text-accent',
              mine ? 'justify-end pr-1' : 'justify-start pl-1',
            )}
          >
            <Pin size={10} aria-hidden />
            Pinned
          </span>
        )}

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
            // Kept visible while the picker or menu is open — otherwise moving
            // the mouse off the message hides the very button the popup is
            // anchored to, and it appears to float free.
            pickerOpen || menuOpen
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
              setMenuOpen(false);
              setPickerOpen((open) => !open);
            }}
            aria-label="React"
            className="press flex size-8 items-center justify-center rounded-full text-muted
                       hover:bg-surface-raised hover:text-accent"
          >
            <SmilePlus size={15} aria-hidden />
          </button>
          {bulkReactions.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setPickerOpen(false);
                setMenuOpen(false);
                onBulkReact(message);
              }}
              aria-label="Quick-react with your preset emoji"
              className="press flex size-8 items-center justify-center rounded-full text-muted
                         hover:bg-surface-raised hover:text-accent"
            >
              <Zap size={15} aria-hidden />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setPickerOpen(false);
              setMenuOpen((open) => !open);
            }}
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="press flex size-8 items-center justify-center rounded-full text-muted
                       hover:bg-surface-raised hover:text-accent"
          >
            <MoreHorizontal size={15} aria-hidden />
          </button>
        </div>

        {pickerOpen && (
          <ReactionPicker
            mine={mine}
            current={myReactions}
            onPick={toggleReaction}
            {...(bulkReactions.length > 0
              ? {
                  onBulk: () => {
                    setPickerOpen(false);
                    onBulkReact(message);
                  },
                  bulkCount: bulkReactions.length,
                }
              : {})}
            onMore={() => {
              setPickerOpen(false);
              setMenuOpen(true);
            }}
            onClose={() => {
              setPickerOpen(false);
            }}
          />
        )}

        {menuOpen && (
          <MessageMenu
            mine={mine}
            pinned={pinned}
            canCopy={message.payload.kind === 'text'}
            canEdit={editable}
            onCopy={copyText}
            onTogglePin={() => {
              onTogglePin(message);
            }}
            onEdit={startEdit}
            onClose={() => {
              setMenuOpen(false);
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
            'relative overflow-hidden',
            mine ? 'animate-enter-right' : 'animate-enter-left',
            'text-[0.9375rem] leading-relaxed',
            cornerClasses(mine, position),
            isVisualMedia ? '' : isAudio ? 'w-[min(78vw,17rem)] px-3 py-2' : 'px-4 py-2.5',
            mine
              ? cn(
                  'text-white',
                  isVisualMedia
                    ? ''
                    : 'bg-gradient-to-b from-accent-solid to-accent-solid-deep shadow-glow',
                )
              : cn(
                  'text-text',
                  isVisualMedia
                    ? ''
                    : 'border border-border bg-surface/80 backdrop-blur-sm shadow-soft',
                ),
          )}
          style={{
            transform: swipe.offset > 0 ? `translateX(${String(swipe.offset)}px)` : undefined,
            transition: swipe.swiping ? 'none' : 'transform 220ms var(--ease-spring)',
            touchAction: 'pan-y',
          }}
        >
          {/* Ping bar on the outer edge. Sits inside the overflow-hidden bubble
              so it hugs the rounded corners, in the padding so it never crosses
              the text. */}
          {pingBar && (
            <span
              aria-hidden
              className={cn(
                'absolute inset-y-0 w-1 bg-amber-400',
                // A slow shimmer along the bar so a mention catches the eye on
                // a screen full of messages without shouting.
                'animate-pulse [animation-duration:2.4s]',
                mine ? 'right-0' : 'left-0',
              )}
            />
          )}

          {message.payload.replyTo && (
            <ReplyQuote reply={message.payload.replyTo} mine={mine} onJump={onJumpTo} />
          )}

          {message.payload.kind === 'image' ? (
            <ImageBubble cryptoKey={cryptoKey} payload={message.payload} onOpen={onOpenImage} />
          ) : message.payload.kind === 'video' ? (
            <VideoBubble cryptoKey={cryptoKey} payload={message.payload} />
          ) : message.payload.kind === 'file' ? (
            <FileBubble cryptoKey={cryptoKey} payload={message.payload} mine={mine} />
          ) : message.payload.kind === 'audio' ? (
            <AudioBubble cryptoKey={cryptoKey} payload={message.payload} mine={mine} />
          ) : editing ? (
            <div className="flex flex-col gap-1">
              <textarea
                autoFocus
                value={draft}
                rows={Math.min(8, draft.split('\n').length)}
                onChange={(event) => {
                  setDraft(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    saveEdit();
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    cancelEdit();
                  }
                }}
                aria-label="Edit message"
                className="w-full resize-none rounded-md border border-border bg-surface px-2 py-1
                           text-[0.9375rem] text-text focus:border-accent focus:outline-none"
              />
              <span className={cn('text-[0.625rem]', mine ? 'text-white/70' : 'text-muted')}>
                escape to{' '}
                <button type="button" onClick={cancelEdit} className="underline hover:text-accent">
                  cancel
                </button>{' '}
                • enter to{' '}
                <button type="button" onClick={saveEdit} className="underline hover:text-accent">
                  save
                </button>
              </span>
            </div>
          ) : (
            /* Rendered as text nodes, never dangerouslySetInnerHTML. React
               escapes these, which is the XSS defence — no sanitiser needed.
               EmojiText only swaps in <img> for shortcodes that resolve to an
               emoji in the pack; everything else stays literal text. */
            <EmojiText text={message.payload.text} createdAt={message.createdAt} />
          )}

          {(showMeta || isVisualMedia) && (
            <div
              className={cn(
                'flex items-center justify-end gap-1 text-[0.6875rem]',
                isVisualMedia
                  ? 'pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2.5 pb-1.5 pt-6 text-white'
                  : cn('mt-1', mine ? 'text-white/70' : 'text-muted'),
              )}
            >
              <time dateTime={new Date(message.createdAt).toISOString()}>
                {timeLabel(message.createdAt)}
              </time>
              {mine && (
                // Wrapped in a relative button so the popover can anchor to the
                // tick itself. `pointer-events-auto` because on media bubbles
                // the whole meta strip is pointer-events-none (it sits over the
                // image), and the tick is the one thing in it that is tappable.
                <span className="pointer-events-auto">
                  <button
                    ref={tickRef}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setReceiptOpen((open) => !open);
                    }}
                    aria-label="Message info"
                    aria-expanded={receiptOpen}
                    className="press flex items-center rounded px-0.5 hover:opacity-100"
                  >
                    <StateIcon state={message.state} />
                  </button>

                  {receiptOpen && (
                    <ReceiptPopover
                      message={message}
                      anchorRef={tickRef}
                      onClose={() => {
                        setReceiptOpen(false);
                      }}
                    />
                  )}
                </span>
              )}
            </div>
          )}
        </div>

        {/* "edited" marker below the text. Clicking it opens the before/after,
            stacked — original on top, current below. */}
        {message.editedAt !== undefined && !editing && (
          <div className={cn('mt-0.5 flex flex-col gap-1', mine ? 'items-end' : 'items-start')}>
            <button
              type="button"
              onClick={() => {
                setShowHistory((open) => !open);
              }}
              aria-expanded={showHistory}
              className="px-1 text-[0.625rem] text-muted transition-colors hover:text-secondary"
            >
              edited
            </button>

            {showHistory && (
              <div className="max-w-full rounded-md border border-border bg-surface-raised p-2.5 text-xs shadow-soft">
                <p className="mb-0.5 text-[0.625rem] font-medium uppercase tracking-wide text-muted">
                  Original
                </p>
                <p className="mb-2 whitespace-pre-wrap break-words text-secondary">
                  {message.originalText !== undefined
                    ? maskSpoilers(message.originalText)
                    : 'Original unavailable'}
                </p>
                <p className="mb-0.5 text-[0.625rem] font-medium uppercase tracking-wide text-muted">
                  Edited
                </p>
                <p className="whitespace-pre-wrap break-words text-text">
                  {maskSpoilers(messageText)}
                </p>
              </div>
            )}
          </div>
        )}

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
