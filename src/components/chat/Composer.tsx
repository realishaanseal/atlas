import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import {
  ArrowUp,
  AtSign,
  Camera,
  Clock,
  CornerUpLeft,
  ImagePlus,
  Loader2,
  Paperclip,
  Timer,
  Mic,
  PenLine,
  Plus,
  Smile,
  Trash2,
  X,
} from 'lucide-react';
import type { ReplyRef } from '@/types';
import { AUDIO, IMAGES, MESSAGES, RETENTION_OPTIONS, VIDEO, gifSearchEnabled } from '@/config';
import { useRecorder } from '@/hooks/useRecorder';
import { useCustomEmoji } from '@/hooks/useCustomEmoji';
import { useMentionNames } from '@/hooks/useMentionNames';
import { EmojiPicker } from './EmojiPicker';
import { GifPicker } from './GifPicker';
import { ScheduleModal } from './ScheduleModal';
import type { GifResult } from '@/services/gifs';
import { useBackClose } from '@/hooks/useBackGuard';
import { Popover } from '@/components/ui/Popover';
import { riseIn } from '@/motion/variants';
import { springs } from '@/motion/springs';
import { cn } from '@/utils/cn';
import type { Variants } from 'motion/react';

/** Attach-menu rows cascade up from the button. */
const ATTACH_ITEM: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { ...springs.snappy, delay: Math.min(i, 6) * 0.025 },
  }),
};

interface ComposerProps {
  onSend: (text: string) => void;
  /** Single-image paths: paste, drag-drop and the camera sheet. */
  onSendImage: (file: File) => void;
  /** The + → Media picker: photos and video, several at a time. */
  onSendMedia: (files: File[]) => void;
  /** The + → File picker: any file type, stored opaquely. */
  onSendFiles: (files: File[]) => void;
  /** Retention for the next message, in ms. Never longer than the 24h default. */
  retentionMs: number;
  onRetentionChange: (ms: number) => void;
  onSendVoice: (blob: Blob, durationMs: number, peaks: number[]) => void;
  onSendGif: (result: GifResult) => void;
  onOpenCamera: () => void;
  onOpenScribble: () => void;
  onSchedule: (text: string, deliverAt: number) => void;
  onTyping: () => void;
  replyTo: ReplyRef | null;
  onCancelReply: () => void;
  disabled?: boolean;
  uploading?: boolean;
}

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60))}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * The composer.
 *
 * Layout follows the pattern every mature messenger converged on, because it
 * solves a real problem: there are four actions but only two thumb-reachable
 * corners. Attachments collapse behind one expanding control on the left; the
 * right button morphs between mic and send depending on whether there is text.
 * Nothing is ever hidden behind a menu you need two hands to reach.
 */
export function Composer({
  onSend,
  onSendImage,
  onSendMedia,
  onSendFiles,
  retentionMs,
  onRetentionChange,
  onSendVoice,
  onSendGif,
  onOpenCamera,
  onOpenScribble,
  onSchedule,
  onTyping,
  replyTo,
  onCancelReply,
  disabled = false,
  uploading = false,
}: ComposerProps) {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);

  // attachOpen's back / dismiss handling lives in <Popover>.
  useBackClose(emojiOpen, () => {
    setEmojiOpen(false);
  });
  useBackClose(gifOpen, () => {
    setGifOpen(false);
  });
  useBackClose(scheduleModalOpen, () => {
    setScheduleModalOpen(false);
  });

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const attachmentRef = useRef<HTMLInputElement | null>(null);
  const attachRef = useRef<HTMLDivElement | null>(null);
  const emojiRef = useRef<HTMLDivElement | null>(null);
  const gifRef = useRef<HTMLDivElement | null>(null);

  /** Inserts at the caret rather than appending — matters mid-sentence. */
  const insertEmoji = (emoji: string) => {
    const element = textareaRef.current;
    if (!element) {
      setValue((current) => current + emoji);
      return;
    }
    const start = element.selectionStart;
    const end = element.selectionEnd;
    setValue((current) => current.slice(0, start) + emoji + current.slice(end));
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  /**
   * Wraps the selection in a Markdown marker — `**` for bold, `*` for italic —
   * and toggles it back off if the selection is already wrapped, which is what
   * every editor does and what makes the shortcut feel native.
   *
   * With nothing selected it inserts the pair and parks the caret between them,
   * so Cmd+B then typing produces bold text directly.
   */
  const wrapSelection = (marker: string) => {
    const element = textareaRef.current;
    if (!element) return;

    const start = element.selectionStart;
    const end = element.selectionEnd;
    const selected = value.slice(start, end);
    const len = marker.length;

    /**
     * How many asterisks already hug the selection on each side.
     *
     * Counting the whole run — rather than just peeking at `len` characters —
     * is what lets bold and italic nest correctly. `**bold**` has a run of 2,
     * so Cmd+I must ADD italic (giving `***bold***`) rather than strip one
     * asterisk off each side and silently downgrade it. The parity test below
     * falls out of that: an odd run means italic is already applied.
     */
    let runBefore = 0;
    for (let i = start - 1; i >= 0 && value[i] === '*'; i -= 1) runBefore += 1;
    let runAfter = 0;
    for (let i = end; i < value.length && value[i] === '*'; i += 1) runAfter += 1;

    const alreadyApplied =
      marker === '*'
        ? runBefore % 2 === 1 && runAfter % 2 === 1
        : runBefore >= 2 && runAfter >= 2;

    // Markers sit just OUTSIDE the selection (you selected the words, not the
    // asterisks) — the common case when toggling off.
    if (alreadyApplied && start >= len) {
      setValue(value.slice(0, start - len) + selected + value.slice(end + len));
      requestAnimationFrame(() => {
        element.focus();
        element.setSelectionRange(start - len, end - len);
      });
      return;
    }

    // Markers sit INSIDE the selection (you selected the asterisks too).
    if (selected.length >= len * 2 && selected.startsWith(marker) && selected.endsWith(marker)) {
      const inner = selected.slice(len, -len);
      setValue(value.slice(0, start) + inner + value.slice(end));
      requestAnimationFrame(() => {
        element.focus();
        element.setSelectionRange(start, start + inner.length);
      });
      return;
    }

    setValue(value.slice(0, start) + marker + selected + marker + value.slice(end));
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(start + len, start + len + selected.length);
    });
  };

  // --- @mention and :shortcode: autocomplete --------------------------------

  const { emojis: customEmojis } = useCustomEmoji();
  const { peerName } = useMentionNames();
  const [caret, setCaret] = useState(0);
  const [highlight, setHighlight] = useState(0);
  const [suggestDismissed, setSuggestDismissed] = useState(false);

  /**
   * The partial `@name` before the caret. Anchored to a word boundary so an `@`
   * mid-word does not trigger, and allows an empty query so bare `@` shows both
   * people.
   */
  const mentionQuery = useMemo(() => {
    const match = /(?:^|\s)@(\w*)$/.exec(value.slice(0, caret));
    return match ? (match[1] ?? '') : null;
  }, [value, caret]);

  /**
   * The partial `:shortcode` before the caret. A word boundary keeps a colon in
   * ordinary writing ("12:30") from opening the menu, and one character is
   * required so a bare `:` does not dump the whole pack.
   */
  const shortcodeQuery = useMemo(() => {
    const match = /(?:^|\s):([a-z0-9_]{1,32})$/.exec(value.slice(0, caret));
    return match?.[1] ?? null;
  }, [value, caret]);

  interface Suggestion {
    id: string;
    label: string;
    insert: string;
    imageUrl?: string;
  }

  /** Whichever menu is active — mentions take precedence over shortcodes. */
  const active = useMemo<{ trigger: '@' | ':'; items: Suggestion[] } | null>(() => {
    if (suggestDismissed) return null;

    if (mentionQuery !== null) {
      const query = mentionQuery.toLowerCase();
      const candidates: Suggestion[] = [
        { id: 'you', label: 'You', insert: '@You ' },
        { id: 'peer', label: peerName, insert: `@${peerName} ` },
      ];
      const items = candidates.filter((c) => c.label.toLowerCase().startsWith(query));
      return items.length > 0 ? { trigger: '@', items } : null;
    }

    if (shortcodeQuery !== null) {
      const starts = customEmojis.filter((emoji) => emoji.name.startsWith(shortcodeQuery));
      const contains = customEmojis.filter(
        (emoji) => !emoji.name.startsWith(shortcodeQuery) && emoji.name.includes(shortcodeQuery),
      );
      const items = [...starts, ...contains].slice(0, 8).map(
        (emoji): Suggestion => ({
          id: emoji.id,
          label: `:${emoji.name}:`,
          insert: `:${emoji.name}: `,
          imageUrl: emoji.url,
        }),
      );
      return items.length > 0 ? { trigger: ':', items } : null;
    }

    return null;
  }, [suggestDismissed, mentionQuery, shortcodeQuery, peerName, customEmojis]);

  const activeItems = active?.items ?? [];

  // A new query is a new menu: reset the highlight to the top.
  useEffect(() => {
    setHighlight(0);
  }, [mentionQuery, shortcodeQuery]);

  const complete = (item: Suggestion) => {
    if (!active) return;
    const element = textareaRef.current;
    const start = value.slice(0, caret).lastIndexOf(active.trigger);
    if (start < 0) return;

    const next = value.slice(0, start) + item.insert + value.slice(caret);
    setValue(next);
    setSuggestDismissed(false);

    const position = start + item.insert.length;
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(position, position);
      setCaret(position);
    });
  };

  const recorder = useRecorder();
  const isRecording = recorder.state === 'recording' || recorder.state === 'requesting';

  useLayoutEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${String(Math.min(element.scrollHeight, 160))}px`;
  }, [value]);

  // Starting a reply should drop the cursor straight into the text box, so you
  // can type without a second click.
  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo]);

  const currentRetention =
    RETENTION_OPTIONS.find((o) => o.ms === retentionMs)?.label ?? '24 hours';

  const attachItems: {
    icon: typeof Camera;
    label: string;
    action: () => void;
    trailing?: string;
  }[] = [
    { icon: ImagePlus, label: 'Media', action: () => { fileRef.current?.click(); } },
    { icon: Paperclip, label: 'File', action: () => { attachmentRef.current?.click(); } },
    {
      icon: Timer,
      label: 'Disappears in',
      trailing: currentRetention,
      // Cycles rather than opening a submenu — three options is fewer taps to
      // step through than to pick from.
      action: () => {
        const index = RETENTION_OPTIONS.findIndex((o) => o.ms === retentionMs);
        const next = RETENTION_OPTIONS[(index + 1) % RETENTION_OPTIONS.length];
        if (next) onRetentionChange(next.ms);
      },
    },
    { icon: Camera, label: 'Camera', action: onOpenCamera },
    { icon: PenLine, label: 'Scribble', action: onOpenScribble },
    { icon: Clock, label: 'Schedule', action: () => { setScheduleMode(true); } },
  ];

  /**
   * Fires the send animation for exactly one cycle.
   *
   * Keyed rather than toggled with a timer: bumping the key remounts the
   * animated elements, so rapid-fire sends each get their own full animation
   * instead of the second one landing mid-flight and being ignored.
   */
  const [launchKey, setLaunchKey] = useState(0);

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed.length === 0 || disabled) return;
    onSend(trimmed);
    setValue('');
    setLaunchKey((k) => k + 1);
  };

  const finishRecording = async () => {
    const result = await recorder.stop();
    if (result) onSendVoice(result.blob, result.durationMs, result.peaks);
  };

  const hasCoarsePointer =
    typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  const hasText = value.trim().length > 0;
  const canSend = hasText && !disabled;

  // --- recording state replaces the whole composer -------------------------

  if (isRecording) {
    const nearLimit = recorder.elapsedMs > AUDIO.MAX_DURATION_MS - 15_000;

    return (
      <div className="glass edge-light border-t border-hairline px-3 py-3 pb-safe">
        <div className="mx-auto max-w-[850px] pb-3">
          <div
            className={cn(
              'flex items-center gap-1.5 rounded-2xl border p-1.5 depth',
              'bg-surface/55 backdrop-blur-md transition-colors duration-200 ease-soft',
              nearLimit ? 'border-danger/60' : 'border-hairline',
            )}
          >
            <button
              type="button"
              onClick={recorder.cancel}
              aria-label="Discard recording"
              className="press flex size-10 shrink-0 items-center justify-center rounded-full
                         text-danger hover:bg-danger/15"
            >
              <Trash2 size={18} aria-hidden />
            </button>

            <div className="flex min-w-0 flex-1 items-center gap-3 px-1">
              <span className="relative flex size-2.5 shrink-0" aria-hidden>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-danger opacity-70" />
                <span className="relative inline-flex size-2.5 rounded-full bg-danger" />
              </span>

              <span
                className={cn(
                  'shrink-0 text-sm tabular-nums',
                  nearLimit ? 'text-danger' : 'text-text',
                )}
              >
                {formatTime(recorder.elapsedMs)}
              </span>

              {/* Live level meter. Decorative — the timer carries the real info. */}
              <div className="flex h-6 flex-1 items-center gap-[2px] overflow-hidden" aria-hidden>
                {Array.from({ length: 32 }, (_, index) => (
                  <span
                    key={index}
                    className="w-[3px] shrink-0 rounded-full bg-accent/70 transition-[height] duration-100"
                    style={{
                      height: `${String(
                        Math.max(
                          12,
                          Math.min(
                            100,
                            recorder.level * (0.5 + Math.sin(index * 1.7) * 0.35 + 0.4),
                          ),
                        ),
                      )}%`,
                    }}
                  />
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void finishRecording()}
              aria-label="Send voice message"
              className="press flex size-10 shrink-0 items-center justify-center rounded-full
                         bg-gradient-to-b from-accent-solid to-accent-solid-deep text-white
                         shadow-glow hover:shadow-glow-strong"
            >
              <ArrowUp size={18} aria-hidden />
            </button>
          </div>

          <p className="mt-2 text-center text-[0.6875rem] text-muted">
            {nearLimit ? 'Approaching the two-minute limit' : 'Recording — tap send when done'}
          </p>
        </div>
      </div>
    );
  }

  // --- normal state --------------------------------------------------------

  return (
    <div className="glass edge-light border-t border-hairline px-3 py-3 pb-safe">
      <AnimatePresence>
        {/* Schedule-mode banner: the send button becomes a clock until cancelled. */}
        {scheduleMode && (
          <m.div
            key="schedule"
            variants={riseIn}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="mx-auto mb-2 flex max-w-[850px] items-center gap-2 rounded-md border-l-2
                       border-accent bg-surface/60 py-2 pl-3 pr-2"
          >
            <Clock size={14} className="shrink-0 text-accent" aria-hidden />
            <span className="flex-1 text-xs text-secondary">
              Scheduling — type your message, then tap the clock to pick a time.
            </span>
            <button
              type="button"
              onClick={() => {
                setScheduleMode(false);
              }}
              aria-label="Cancel scheduling"
              className="press flex size-7 shrink-0 items-center justify-center rounded-full
                         text-muted hover:bg-surface-raised hover:text-text"
            >
              <X size={14} aria-hidden />
            </button>
          </m.div>
        )}

        {/* Reply context sits above the pill, matching where the quote will
            appear in the sent bubble. */}
        {replyTo && (
          <m.div
            key="reply"
            variants={riseIn}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="mx-auto mb-2 flex max-w-[850px] items-center gap-2"
          >
            <div
              className="flex min-w-0 flex-1 items-center gap-2 rounded-md border-l-2 border-accent
                         bg-surface/60 py-2 pl-3 pr-2"
            >
              <CornerUpLeft size={14} className="shrink-0 text-accent" aria-hidden />
              <span className="truncate text-xs text-secondary">{replyTo.preview}</span>
            </div>
            <button
              type="button"
              onClick={onCancelReply}
              aria-label="Cancel reply"
              className="press flex size-8 shrink-0 items-center justify-center rounded-full
                         text-muted hover:bg-surface-raised hover:text-text"
            >
              <X size={15} aria-hidden />
            </button>
          </m.div>
        )}
      </AnimatePresence>

      {activeItems.length > 0 && (
        <div
          role="listbox"
          aria-label={active?.trigger === '@' ? 'Mention suggestions' : 'Custom emoji suggestions'}
          className="animate-rise mx-auto mb-2 max-w-[850px] overflow-hidden rounded-md border
                     border-hairline bg-surface/97 shadow-lift backdrop-blur-xl"
        >
          {activeItems.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={index === highlight}
              // pointerdown, not click: clicking blurs the textarea first, and
              // by the time click fires the caret position this completion
              // depends on is gone.
              onPointerDown={(event) => {
                event.preventDefault();
                complete(item);
              }}
              onPointerEnter={() => {
                setHighlight(index);
              }}
              className={cn(
                'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm',
                index === highlight ? 'bg-accent-solid/25 text-text' : 'text-secondary',
              )}
            >
              {item.imageUrl ? (
                <img src={item.imageUrl} alt="" aria-hidden className="size-5 object-contain" />
              ) : (
                <span
                  className="flex size-5 shrink-0 items-center justify-center rounded-full
                             bg-accent-solid/20 text-accent"
                >
                  <AtSign size={12} aria-hidden />
                </span>
              )}
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* One pill holds all three controls.
          Alignment is structural rather than eyeballed: the buttons and the
          textarea are siblings in a padded flex row, so they cannot drift out
          of line at any text length or screen width. The focus ring lives on
          the container via focus-within, which is why the whole control lights
          up as one object instead of just the text field. */}
      <div
        className={cn(
          'mx-auto mb-3 flex max-w-[850px] items-end gap-1.5 rounded-2xl border p-1.5',
          'bg-surface/55 backdrop-blur-md',
          'transition-[border-color,box-shadow] duration-200 ease-soft',
          focused ? 'border-accent shadow-glow' : 'border-hairline depth hover:border-hairline-strong',
        )}
      >
        {/* One picker for both photos and video. The system file/gallery sheet
            offers everything the accept list covers, and the handler routes by
            the file's own type — so there is no reason to make the person
            declare up front which kind of thing they are about to choose. */}
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={[...IMAGES.ACCEPTED_MIME, ...VIDEO.ACCEPTED_MIME].join(',')}
          className="hidden"
          onChange={(event) => {
            // Handed over as a batch rather than looped here: the parent has to
            // upload them one at a time (each is a sizeable encrypted write),
            // and firing several calls from this handler would race the upload
            // state against itself.
            const files = Array.from(event.target.files ?? []);
            if (files.length > 0) onSendMedia(files);
            event.target.value = '';
          }}
        />
        {/* Attachments: no accept filter, since the point is anything the media
            picker will not take. */}
        <input
          ref={attachmentRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length > 0) onSendFiles(files);
            event.target.value = '';
          }}
        />

        {/* Attachment cluster. The menu rises above the button rather than
            dropping below it — the composer is at the bottom of the screen, so
            downward has nowhere to go. */}
        <div className="relative shrink-0" ref={attachRef}>
          <Popover
            open={attachOpen}
            onClose={() => {
              setAttachOpen(false);
            }}
            anchorRef={attachRef}
            role="menu"
            origin="bottom-left"
            className="glass bottom-[calc(100%+0.75rem)] left-0 w-48 overflow-hidden rounded-md
                       border border-hairline shadow-raised"
          >
            {attachItems.map((item, i) => (
              <m.button
                key={item.label}
                type="button"
                role="menuitem"
                custom={i}
                variants={ATTACH_ITEM}
                onClick={() => {
                  setAttachOpen(false);
                  item.action();
                }}
                className="flex w-full items-center gap-3 border-t border-hairline px-4 py-3
                           text-left text-sm text-secondary transition-colors duration-150
                           first:border-t-0 hover:bg-surface-raised hover:text-text"
              >
                <item.icon size={16} className="text-accent" aria-hidden />
                {item.label}
                {item.trailing && <span className="ml-auto text-xs text-muted">{item.trailing}</span>}
              </m.button>
            ))}
          </Popover>

          <m.button
            type="button"
            onClick={() => {
              setAttachOpen((open) => !open);
            }}
            disabled={disabled || uploading}
            aria-label="Add attachment"
            aria-expanded={attachOpen}
            aria-haspopup="menu"
            whileTap={{ scale: 0.9 }}
            transition={springs.snappy}
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-full transition-colors',
              attachOpen
                ? 'bg-accent-solid text-white shadow-glow'
                : 'text-secondary hover:bg-surface-raised hover:text-accent',
              'disabled:opacity-40 disabled:hover:bg-transparent',
            )}
          >
            {uploading ? (
              <Loader2 size={18} className="animate-spin text-accent" aria-hidden />
            ) : (
              <m.span
                aria-hidden
                className="flex"
                animate={{ rotate: attachOpen ? 225 : 0 }}
                transition={springs.gentle}
              >
                <Plus size={20} aria-hidden />
              </m.span>
            )}
          </m.button>
        </div>

        <label htmlFor="composer" className="sr-only">
          Message
        </label>

        <textarea
          id="composer"
          ref={textareaRef}
          rows={1}
          value={value}
          disabled={disabled}
          maxLength={MESSAGES.MAX_TEXT_LENGTH}
          placeholder="Message"
          onFocus={() => {
            setFocused(true);
          }}
          onBlur={() => {
            setFocused(false);
          }}
          onChange={(event) => {
            setValue(event.target.value);
            setCaret(event.target.selectionStart);
            setSuggestDismissed(false);
            onTyping();
          }}
          // Fires on any caret movement, including click and arrow keys, which
          // is what keeps the suggestion menu in sync when you move back into
          // a half-typed shortcode.
          onSelect={(event) => {
            setCaret(event.currentTarget.selectionStart);
          }}
          onKeyDown={(event) => {
            // Formatting shortcuts, claimed before anything else so they behave
            // the same whether or not a completion menu happens to be open.
            // Cmd on macOS, Ctrl on Windows/Linux — both accepted everywhere.
            if ((event.metaKey || event.ctrlKey) && !event.altKey) {
              const key = event.key.toLowerCase();
              if (key === 'b') {
                event.preventDefault();
                wrapSelection('**');
                return;
              }
              if (key === 'i') {
                event.preventDefault();
                wrapSelection('*');
                return;
              }
            }

            // The suggestion menu claims these keys first. Enter must not send
            // the message while a completion is highlighted — that was the
            // single most likely way to accidentally fire off a half-written
            // shortcode.
            if (activeItems.length > 0) {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setHighlight((current) => (current + 1) % activeItems.length);
                return;
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                setHighlight(
                  (current) => (current - 1 + activeItems.length) % activeItems.length,
                );
                return;
              }
              if (event.key === 'Enter' || event.key === 'Tab') {
                const chosen = activeItems[highlight];
                if (chosen) {
                  event.preventDefault();
                  complete(chosen);
                  return;
                }
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                setSuggestDismissed(true);
                return;
              }
            }

            if (event.key === 'Enter' && !event.shiftKey && !hasCoarsePointer) {
              event.preventDefault();
              submit();
            }
          }}
          onPaste={(event) => {
            // Screenshots land on the clipboard as image files. Intercepting
            // them here is the difference between Cmd+Shift+4 then paste, and
            // save-to-desktop then find-the-file then attach.
            const file = Array.from(event.clipboardData.files).find((f) =>
              f.type.startsWith('image/'),
            );
            if (file) {
              event.preventDefault();
              onSendImage(file);
            }
          }}
          className={cn(
            // Border, background and focus ring all live on the pill, so the
            // field itself is invisible chrome. min-h-10 matches the buttons
            // exactly, which is what keeps the row optically level.
            'max-h-40 min-h-10 flex-1 resize-none border-0 bg-transparent',
            // 16px, not 15px. iOS Safari zooms the page when a focused input
            // is smaller than that, and never zooms back.
            'px-2 py-2 text-base leading-6 text-text',
            'placeholder:text-muted focus:outline-none focus:ring-0',
          )}
        />

        {gifSearchEnabled() && (
          <div className="relative shrink-0" ref={gifRef}>
            {gifOpen && (
              <GifPicker
                onPick={(result) => {
                  setGifOpen(false);
                  onSendGif(result);
                }}
                onPickFile={(file) => {
                  setGifOpen(false);
                  onSendImage(file);
                }}
                onClose={() => {
                  setGifOpen(false);
                }}
              />
            )}
            <button
              type="button"
              onClick={() => {
                setGifOpen((open) => !open);
              }}
              disabled={disabled || uploading}
              aria-label="Search GIFs"
              aria-expanded={gifOpen}
              className={cn(
                'press flex h-10 shrink-0 items-center justify-center rounded-full px-2.5',
                'text-[0.6875rem] font-bold tracking-wide',
                gifOpen
                  ? 'bg-surface-raised text-accent'
                  : 'text-secondary hover:bg-surface-raised hover:text-accent',
                'disabled:opacity-40',
              )}
            >
              GIF
            </button>
          </div>
        )}

        <div className="relative shrink-0" ref={emojiRef}>
          {emojiOpen && (
            <EmojiPicker
              onPick={insertEmoji}
              onClose={() => {
                setEmojiOpen(false);
              }}
            />
          )}
          <button
            type="button"
            onClick={() => {
              setEmojiOpen((open) => !open);
            }}
            disabled={disabled}
            aria-label="Insert emoji"
            aria-expanded={emojiOpen}
            className={cn(
              'press flex size-10 shrink-0 items-center justify-center rounded-full',
              emojiOpen
                ? 'bg-surface-raised text-accent'
                : 'text-secondary hover:bg-surface-raised hover:text-accent',
              'disabled:opacity-40',
            )}
          >
            <Smile size={19} aria-hidden />
          </button>
        </div>

        {/* One button, two jobs. Mic when empty, send when there is text —
            the icons cross-fade and rotate rather than swapping abruptly. */}
        <button
          type="button"
          onClick={() => {
            if (canSend && scheduleMode) setScheduleModalOpen(true);
            else if (canSend) submit();
            else void recorder.start();
          }}
          disabled={disabled}
          aria-label={
            scheduleMode && canSend ? 'Choose a time' : canSend ? 'Send' : 'Record voice message'
          }
          className={cn(
            'press group relative flex size-10 shrink-0 items-center justify-center rounded-full',
            canSend
              ? cn(
                  'animate-gradient bg-gradient-to-br from-accent-solid via-accent-solid-hover',
                  'to-accent-solid-deep text-white shadow-glow hover:shadow-glow-strong',
                  'hover:scale-105',
                )
              : 'bg-surface-raised/80 text-secondary hover:bg-surface-raised hover:text-accent',
            'disabled:opacity-40',
          )}
        >
          {canSend && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"
            >
              <span
                className="absolute inset-y-0 w-1/2 bg-white/25 opacity-0 blur-md
                           group-hover:opacity-100 group-hover:[animation:shimmer_800ms_ease-out]"
              />
            </span>
          )}

          {/* The shockwave left behind by a send. Outside the clipped layer so
              it can expand past the button, and keyed so every send replays. */}
          {launchKey > 0 && (
            <span
              key={launchKey}
              aria-hidden
              className="animate-ring pointer-events-none absolute inset-0 rounded-full
                         border-2 border-accent"
            />
          )}

          {/* Keyed so the throw replays on every send — the class alone would
              only animate once, since it never actually changes. */}
          <span
            key={`icon-${String(launchKey)}`}
            className={cn(
              'relative z-10 grid place-items-center',
              launchKey > 0 && 'animate-launch',
            )}
          >
            {scheduleMode && canSend ? (
              <Clock size={18} aria-hidden />
            ) : (
              <>
                <Mic
                  size={19}
                  aria-hidden
                  className={cn(
                    'col-start-1 row-start-1 transition-all duration-250 ease-spring',
                    canSend ? 'scale-50 rotate-90 opacity-0' : 'scale-100 rotate-0 opacity-100',
                  )}
                />
                <ArrowUp
                  size={18}
                  aria-hidden
                  className={cn(
                    'col-start-1 row-start-1 transition-all duration-250 ease-spring',
                    canSend
                      ? 'scale-100 rotate-0 opacity-100 group-hover:-translate-y-0.5'
                      : 'scale-50 -rotate-90 opacity-0',
                  )}
                />
              </>
            )}
          </span>
        </button>
      </div>

      {recorder.state === 'denied' && (
        <p role="alert" className="mt-2 text-center text-[0.6875rem] text-danger">
          Microphone access was blocked. Enable it in your browser settings.
        </p>
      )}
      {recorder.state === 'unsupported' && (
        <p role="alert" className="mt-2 text-center text-[0.6875rem] text-muted">
          Voice messages aren&apos;t supported in this browser.
        </p>
      )}

      {scheduleModalOpen && (
        <ScheduleModal
          onConfirm={(deliverAt) => {
            onSchedule(value.trim(), deliverAt);
            setValue('');
            setScheduleMode(false);
            setScheduleModalOpen(false);
          }}
          onClose={() => {
            setScheduleModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
