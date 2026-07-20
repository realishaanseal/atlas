import { useRef, useState } from 'react';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { EMOJI } from '@/config';
import { useCustomEmoji } from '@/hooks/useCustomEmoji';
import { normaliseName } from '@/services/emojis';
import { cn } from '@/utils/cn';

/**
 * Add, name, and remove custom emoji.
 *
 * Rendered through a portal to document.body rather than in place. The settings
 * menu it opens from sits inside a `backdrop-filter` ancestor, and a filtered
 * ancestor becomes the containing block for fixed-position descendants — so a
 * centred overlay nested inside it would be centred on that panel rather than
 * on the viewport. This is the same trap the fullscreen image viewer hit.
 */
export function EmojiManager({ onClose }: { onClose: () => void }) {
  const { emojis, add, remove, loading } = useCustomEmoji();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const totalBytes = emojis.reduce((sum, emoji) => sum + emoji.byteSize, 0);
  const full = emojis.length >= EMOJI.MAX_COUNT;

  const chooseFile = (chosen: File | null) => {
    setError(null);
    setFile(chosen);
    // Seed the name from the filename — most people name the file after the
    // thing already, so this is right often enough to save the typing.
    if (chosen && name.trim().length === 0) {
      setName(normaliseName(chosen.name.replace(/\.[^.]+$/, '')));
    }
  };

  const submit = async () => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      await add(file, name);
      setFile(null);
      setName('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not add that emoji');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Custom emoji"
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-deep/80 p-4
                 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(event) => {
          event.stopPropagation();
        }}
        className="animate-rise flex max-h-[80vh] w-[min(30rem,92vw)] flex-col overflow-hidden
                   rounded-lg border border-border bg-surface shadow-lift"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-medium text-text">Custom emoji</h2>
            <p className="text-[0.6875rem] text-muted">
              {emojis.length} of {EMOJI.MAX_COUNT} · {(totalBytes / 1024).toFixed(0)} KB · shared
              with the other device
            </p>
          </div>
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

        <div className="border-b border-border p-4">
          <div className="flex items-end gap-2">
            <button
              type="button"
              disabled={full || busy}
              onClick={() => fileRef.current?.click()}
              className={cn(
                'press flex size-14 shrink-0 items-center justify-center rounded-md border',
                'border-dashed border-border-strong bg-surface-raised text-muted',
                'hover:border-accent hover:text-accent disabled:opacity-40',
              )}
              aria-label="Choose an image"
            >
              {file ? (
                <img
                  src={URL.createObjectURL(file)}
                  alt=""
                  aria-hidden
                  className="size-10 object-contain"
                />
              ) : (
                <Plus size={18} aria-hidden />
              )}
            </button>

            <div className="min-w-0 flex-1">
              <label htmlFor="emoji-name" className="mb-1 block text-[0.6875rem] text-secondary">
                Shortcode
              </label>
              <div className="flex items-center gap-1 rounded-sm border border-border bg-surface-raised px-2">
                <span className="text-sm text-muted">:</span>
                <input
                  id="emoji-name"
                  value={name}
                  disabled={full || busy}
                  onChange={(event) => {
                    setName(normaliseName(event.target.value));
                  }}
                  placeholder="party_parrot"
                  className="h-9 min-w-0 flex-1 bg-transparent text-sm text-text
                             placeholder:text-muted focus:outline-none"
                />
                <span className="text-sm text-muted">:</span>
              </div>
            </div>

            <button
              type="button"
              disabled={!file || !EMOJI.NAME_PATTERN.test(name) || busy || full}
              onClick={() => void submit()}
              className="press flex h-9 shrink-0 items-center gap-1.5 rounded-sm bg-gradient-to-b
                         from-accent-solid to-accent-solid-deep px-3 text-sm text-white
                         shadow-glow disabled:opacity-40 disabled:shadow-none"
            >
              {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
              Add
            </button>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept={EMOJI.ACCEPTED_MIME.join(',')}
            className="sr-only"
            onChange={(event) => {
              chooseFile(event.target.files?.[0] ?? null);
            }}
          />

          {error !== null && <p className="mt-2 text-xs text-danger">{error}</p>}

          {full && (
            <p className="mt-2 text-xs text-muted">
              The pack is full. Remove one to add another.
            </p>
          )}

          <p className="mt-2 text-[0.625rem] leading-relaxed text-muted">
            PNG, JPEG and WebP are resized to {EMOJI.MAX_DIMENSION}px and stripped of metadata.
            Animated GIFs are kept as-is so the animation survives, which means they are not
            resized and must be under {Math.round(EMOJI.MAX_ENCODED_BYTES / 1024)} KB.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading && (
            <div className="flex justify-center py-8">
              <Loader2 size={18} className="animate-spin text-accent" aria-label="Loading" />
            </div>
          )}

          {!loading && emojis.length === 0 && (
            <p className="py-8 text-center text-xs text-muted">
              No custom emoji yet. Add one above, then type <code>:name:</code> in a message.
            </p>
          )}

          {emojis.map((emoji) => (
            <div
              key={emoji.id}
              className="group flex items-center gap-3 rounded-sm px-2 py-1.5 hover:bg-surface-raised"
            >
              <img src={emoji.url} alt="" aria-hidden className="size-8 object-contain" />
              <span className="min-w-0 flex-1 truncate text-sm text-text">:{emoji.name}:</span>
              <span className="shrink-0 text-[0.625rem] tabular-nums text-muted">
                {(emoji.byteSize / 1024).toFixed(0)} KB
              </span>
              <button
                type="button"
                onClick={() => void remove(emoji.id)}
                aria-label={`Delete :${emoji.name}:`}
                className="press flex size-8 shrink-0 items-center justify-center rounded-full
                           text-muted opacity-0 transition-opacity hover:bg-danger/15
                           hover:text-danger focus:opacity-100 group-hover:opacity-100"
              >
                <Trash2 size={14} aria-hidden />
              </button>
            </div>
          ))}
        </div>

        <p className="border-t border-border px-4 py-2 text-[0.625rem] leading-relaxed text-muted">
          Emoji are encrypted like everything else, but unlike messages they do not expire after
          24 hours — a pack that vanished daily would be useless. Deleting one here removes it for
          both of you.
        </p>
      </div>
    </div>,
    document.body,
  );
}
