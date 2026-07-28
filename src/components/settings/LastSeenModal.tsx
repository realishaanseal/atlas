import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, EyeOff, X } from 'lucide-react';
import { cn } from '@/utils/cn';

interface LastSeenModalProps {
  /** Current manual last-seen, or null when presence is normal. */
  value: number | null;
  onApply: (value: number | null) => void;
  onClose: () => void;
}

/** Formats a timestamp for a datetime-local input (local time, no seconds). */
function toLocalInput(ms: number): string {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

export function LastSeenModal({ value, onApply, onClose }: LastSeenModalProps) {
  const [draft, setDraft] = useState(() => toLocalInput(value ?? Date.now() - 60 * 60 * 1000));

  const chosen = new Date(draft).getTime();
  // A year back is the rules' floor; the future would be nonsense.
  const valid = Number.isFinite(chosen) && chosen <= Date.now() && chosen > Date.now() - 31536000000;

  const presets: { label: string; at: () => number }[] = [
    { label: '15 minutes ago', at: () => Date.now() - 15 * 60 * 1000 },
    { label: '1 hour ago', at: () => Date.now() - 60 * 60 * 1000 },
    { label: 'Last night', at: () => {
        const d = new Date();
        d.setHours(23, 0, 0, 0);
        if (d.getTime() > Date.now()) d.setDate(d.getDate() - 1);
        return d.getTime();
      },
    },
    { label: 'Yesterday', at: () => Date.now() - 24 * 60 * 60 * 1000 },
  ];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Last seen"
      className="animate-backdrop fixed inset-0 z-50 flex items-center justify-center bg-bg-deep/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(event) => {
          event.stopPropagation();
        }}
        className="animate-scale-in w-[min(25rem,92vw)] overflow-hidden rounded-lg border
                   border-border bg-surface shadow-lift"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-text">
            <Clock size={15} className="text-accent" aria-hidden />
            Last seen
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

        <div className="p-4">
          {value !== null && (
            <div className="mb-3 flex items-center gap-2 rounded-md border border-accent/40
                            bg-accent-muted/30 px-3 py-2 text-[0.8125rem] text-text">
              <EyeOff size={15} className="shrink-0 text-accent" aria-hidden />
              <span className="min-w-0 flex-1">
                Currently showing{' '}
                <span className="font-medium">
                  {new Date(value).toLocaleString([], {
                    weekday: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
              </span>
            </div>
          )}

          <p className="mb-3 text-[0.8125rem] leading-relaxed text-secondary">
            Pick the time you want shown as your last seen. While this is set you appear offline
            and your typing indicator is hidden, so nothing contradicts it. Messages still send
            and arrive exactly as normal.
          </p>

          <div className="mb-3 flex flex-wrap gap-2">
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setDraft(toLocalInput(preset.at()));
                }}
                className="press rounded-full border border-border bg-surface-raised px-3 py-1.5
                           text-xs text-secondary hover:border-accent hover:text-text"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <input
            type="datetime-local"
            value={draft}
            max={toLocalInput(Date.now())}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            className="mb-1 h-11 w-full rounded-md border border-border bg-surface-raised px-3
                       text-sm text-text focus:border-accent focus:outline-none [color-scheme:dark]"
          />
          <p className="mb-4 text-[0.6875rem] text-muted">
            {valid ? 'They will see this as your last seen.' : 'Pick a time in the past year.'}
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={!valid}
              onClick={() => {
                onApply(chosen);
                onClose();
              }}
              className={cn(
                'press flex flex-1 items-center justify-center gap-2 rounded-md py-2.5 text-sm',
                'font-medium text-white shadow-glow',
                'animate-gradient bg-gradient-to-br from-accent-solid via-accent-solid-hover to-accent-solid-deep',
                'disabled:opacity-40 disabled:shadow-none',
              )}
            >
              <Clock size={15} aria-hidden />
              {value === null ? 'Set last seen' : 'Update'}
            </button>

            {value !== null && (
              <button
                type="button"
                onClick={() => {
                  onApply(null);
                  onClose();
                }}
                className="press rounded-md border border-border px-3 py-2.5 text-sm text-secondary
                           hover:border-danger hover:text-danger"
              >
                Turn off
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
