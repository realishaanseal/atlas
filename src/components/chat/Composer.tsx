import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  Camera,
  CornerUpLeft,
  ImagePlus,
  Loader2,
  Mic,
  Plus,
  Smile,
  Trash2,
  X,
} from 'lucide-react';
import type { ReplyRef } from '@/types';
import { AUDIO, IMAGES, MESSAGES, gifSearchEnabled } from '@/config';
import { useRecorder } from '@/hooks/useRecorder';
import { useCustomEmoji } from '@/hooks/useCustomEmoji';
import { EmojiPicker } from './EmojiPicker';
import { GifPicker } from './GifPicker';
import type { GifResult } from '@/services/gifs';
import { cn } from '@/utils/cn';

interface ComposerProps {
  onSend: (text: string) => void;
  onSendImage: (file: File) => void;
  onSendVoice: (blob: Blob, durationMs: number, peaks: number[]) => void;
  onSendGif: (result: GifResult) => void;
  onOpenCamera: () => void;
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
  onSendVoice,
  onSendGif,
  onOpenCamera,
  onTyping,
  replyTo,
  onCancelReply,
  disabled = false,
  uploading = false,
}: ComposerProps) {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
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

  // --- :shortcode: autocomplete ---------------------------------------------

  const { emojis: customEmojis } = useCustomEmoji();
  const [caret, setCaret] = useState(0);
  const [highlight, setHighlight] = useState(0);
  const [suggestDismissed, setSuggestDismissed] = useState(false);

  /**
   * The partial shortcode immediately before the caret, if any.
   *
   * Anchored to a word boundary so a colon in ordinary writing ("12:30",
   * "note: this") cannot open the menu, and requires at least one character
   * after the colon so typing a bare `:` does not dump the whole pack on
   * screen.
   */
  const shortcodeQuery = useMemo(() => {
    const before = value.slice(0, caret);
    const match = /(?:^|\s):([a-z0-9_]{1,32})$/.exec(before);
    return match?.[1] ?? null;
  }, [value, caret]);

  const suggestions = useMemo(() => {
    if (shortcodeQuery === null || suggestDismissed) return [];
    // Prefix matches first, then anything containing the query — typing "par"
    // should surface `:party_parrot:` above `:sad_parrot:`.
    const starts = customEmojis.filter((emoji) => emoji.name.startsWith(shortcodeQuery));
    const contains = customEmojis.filter(
      (emoji) => !emoji.name.startsWith(shortcodeQuery) && emoji.name.includes(shortcodeQuery),
    );
    return [...starts, ...contains].slice(0, 8);
  }, [shortcodeQuery, customEmojis, suggestDismissed]);

  // A new query is a new menu, so the highlight goes back to the top and any
  // earlier dismissal stops applying.
  useEffect(() => {
    setHighlight(0);
  }, [shortcodeQuery]);

  const completeShortcode = (name: string) => {
    const element = textareaRef.current;
    const before = value.slice(0, caret);
    const start = before.lastIndexOf(':');
    if (start < 0) return;

    const replacement = `:${name}: `;
    const next = value.slice(0, start) + replacement + value.slice(caret);
    setValue(next);
    setSuggestDismissed(false);

    const position = start + replacement.length;
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

  useEffect(() => {
    if (!attachOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!attachRef.current?.contains(event.target as Node)) setAttachOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAttachOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [attachOpen]);

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed.length === 0 || disabled) return;
    onSend(trimmed);
    setValue('');
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
      <div className="glass edge-light border-t border-border px-3 py-3 pb-safe">
        <div className="mx-auto max-w-[850px] pb-3">
          <div
            className={cn(
              'flex items-center gap-1.5 rounded-2xl border p-1.5 shadow-soft',
              'bg-surface/60 backdrop-blur-sm transition-colors duration-200 ease-soft',
              nearLimit ? 'border-danger/60' : 'border-border',
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
    <div className="glass edge-light border-t border-border px-3 py-3 pb-safe">
      {/* Reply context sits above the pill, matching where the quote will
          appear in the sent bubble. */}
      {replyTo && (
        <div className="animate-rise mx-auto mb-2 flex max-w-[850px] items-center gap-2">
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
        </div>
      )}

      {suggestions.length > 0 && (
        <div
          role="listbox"
          aria-label="Custom emoji suggestions"
          className="animate-rise mx-auto mb-2 max-w-[850px] overflow-hidden rounded-md border
                     border-border bg-surface/97 shadow-lift backdrop-blur-xl"
        >
          {suggestions.map((emoji, index) => (
            <button
              key={emoji.id}
              type="button"
              role="option"
              aria-selected={index === highlight}
              // pointerdown, not click: clicking blurs the textarea first, and
              // by the time click fires the caret position this completion
              // depends on is gone.
              onPointerDown={(event) => {
                event.preventDefault();
                completeShortcode(emoji.name);
              }}
              onPointerEnter={() => {
                setHighlight(index);
              }}
              className={cn(
                'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm',
                index === highlight ? 'bg-accent-solid/25 text-text' : 'text-secondary',
              )}
            >
              <img src={emoji.url} alt="" aria-hidden className="size-5 object-contain" />
              <span className="truncate">:{emoji.name}:</span>
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
          'mx-auto flex max-w-[850px] items-end gap-1.5 rounded-2xl border p-1.5',
          'bg-surface/60 backdrop-blur-sm shadow-soft mb-3',
          'transition-[border-color,box-shadow] duration-200 ease-soft',
          focused ? 'border-accent shadow-glow' : 'border-border hover:border-border-strong',
        )}
      >
        <input
          ref={fileRef}
          type="file"
          accept={IMAGES.ACCEPTED_MIME.join(',')}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onSendImage(file);
            event.target.value = '';
          }}
        />

        {/* Attachment cluster. The menu rises above the button rather than
            dropping below it — the composer is at the bottom of the screen, so
            downward has nowhere to go. */}
        <div className="relative shrink-0" ref={attachRef}>
          {attachOpen && (
            <div
              role="menu"
              className="glass animate-rise absolute bottom-[calc(100%+0.75rem)] left-0 w-44
                         overflow-hidden rounded-md border border-border shadow-lift"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAttachOpen(false);
                  fileRef.current?.click();
                }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm
                           transition-colors duration-150 hover:bg-surface-raised"
              >
                <ImagePlus size={16} className="text-accent" aria-hidden />
                Photo
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAttachOpen(false);
                  onOpenCamera();
                }}
                className="flex w-full items-center gap-3 border-t border-border px-4 py-3
                           text-left text-sm transition-colors duration-150 hover:bg-surface-raised"
              >
                <Camera size={16} className="text-accent" aria-hidden />
                Camera
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setAttachOpen((open) => !open);
            }}
            disabled={disabled || uploading}
            aria-label="Add attachment"
            aria-expanded={attachOpen}
            aria-haspopup="menu"
            className={cn(
              'press flex size-10 shrink-0 items-center justify-center rounded-full',
              attachOpen
                ? 'bg-accent-solid text-white shadow-glow'
                : 'text-secondary hover:bg-surface-raised hover:text-accent',
              'disabled:opacity-40 disabled:hover:bg-transparent',
            )}
          >
            {uploading ? (
              <Loader2 size={18} className="animate-spin text-accent" aria-hidden />
            ) : (
              <Plus
                size={20}
                aria-hidden
                className={cn(
                  'transition-transform duration-300 ease-spring',
                  attachOpen && 'rotate-45',
                )}
              />
            )}
          </button>
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
            // The suggestion menu claims these keys first. Enter must not send
            // the message while a completion is highlighted — that was the
            // single most likely way to accidentally fire off a half-written
            // shortcode.
            if (suggestions.length > 0) {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setHighlight((current) => (current + 1) % suggestions.length);
                return;
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                setHighlight(
                  (current) => (current - 1 + suggestions.length) % suggestions.length,
                );
                return;
              }
              if (event.key === 'Enter' || event.key === 'Tab') {
                const chosen = suggestions[highlight];
                if (chosen) {
                  event.preventDefault();
                  completeShortcode(chosen.name);
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
            if (canSend) submit();
            else void recorder.start();
          }}
          disabled={disabled}
          aria-label={canSend ? 'Send' : 'Record voice message'}
          className={cn(
            'press group relative flex size-10 shrink-0 items-center justify-center',
            'overflow-hidden rounded-full',
            canSend
              ? 'bg-gradient-to-b from-accent-solid to-accent-solid-deep text-white shadow-glow hover:shadow-glow-strong'
              : 'bg-surface-raised/80 text-secondary hover:bg-surface-raised hover:text-accent',
            'disabled:opacity-40',
          )}
        >
          {canSend && (
            <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
              <span
                className="absolute inset-y-0 w-1/2 bg-white/25 opacity-0 blur-md
                           group-hover:opacity-100 group-hover:[animation:shimmer_800ms_ease-out]"
              />
            </span>
          )}

          <span className="relative z-10 grid place-items-center">
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
    </div>
  );
}
