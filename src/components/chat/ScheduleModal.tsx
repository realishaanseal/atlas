import { useState } from 'react';
import { m } from 'motion/react';
import { X, Clock } from 'lucide-react';
import { SCHEDULE } from '@/config';
import { Overlay } from '@/components/ui/Overlay';
import { springs } from '@/motion/springs';
import { cn } from '@/utils/cn';

interface ScheduleModalProps {
  open: boolean;
  onConfirm: (deliverAt: number) => void;
  onClose: () => void;
}

/** Formats a timestamp for a datetime-local input (local time, no seconds). */
function toLocalInput(ms: number): string {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

export function ScheduleModal({ open, onConfirm, onClose }: ScheduleModalProps) {
  const [value, setValue] = useState(() => toLocalInput(Date.now() + 60 * 60 * 1000));

  const chosen = new Date(value).getTime();
  const min = Date.now() + SCHEDULE.MIN_AHEAD_MS;
  const max = Date.now() + SCHEDULE.MAX_AHEAD_MS;
  const valid = Number.isFinite(chosen) && chosen >= min && chosen <= max;

  const presets: { label: string; at: () => number }[] = [
    { label: 'In 1 hour', at: () => Date.now() + 60 * 60 * 1000 },
    {
      label: 'This evening',
      at: () => {
        const d = new Date();
        d.setHours(18, 0, 0, 0);
        if (d.getTime() < Date.now() + SCHEDULE.MIN_AHEAD_MS) d.setDate(d.getDate() + 1);
        return d.getTime();
      },
    },
    {
      label: 'Tomorrow 9am',
      at: () => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(9, 0, 0, 0);
        return d.getTime();
      },
    },
  ];

  return (
    <Overlay open={open} onClose={onClose} label="Schedule message" size="w-[min(24rem,92vw)]">
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-medium text-text">
          <Clock size={15} className="text-accent" aria-hidden />
          Schedule message
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
        <div className="mb-3 flex flex-wrap gap-2">
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                setValue(toLocalInput(preset.at()));
              }}
              className="press rounded-full border border-hairline bg-surface-raised px-3 py-1.5
                         text-xs text-secondary hover:border-accent hover:text-text"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <input
          type="datetime-local"
          value={value}
          min={toLocalInput(min)}
          max={toLocalInput(max)}
          onChange={(event) => {
            setValue(event.target.value);
          }}
          className="mb-1 h-11 w-full rounded-md border border-hairline bg-surface-raised px-3
                     text-sm text-text focus:border-accent focus:outline-none [color-scheme:dark]"
        />
        <p className="mb-4 text-[0.6875rem] text-muted">
          {valid
            ? `Delivers ${new Date(chosen).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' })}`
            : 'Pick a time between a minute and a week from now.'}
        </p>

        <m.button
          type="button"
          disabled={!valid}
          onClick={() => {
            onConfirm(chosen);
          }}
          whileTap={{ scale: 0.98 }}
          transition={springs.snappy}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-md py-2.5 text-sm',
            'font-medium text-white shadow-accent',
            'bg-gradient-to-b from-accent-solid to-accent-solid-deep disabled:opacity-40 disabled:shadow-none',
          )}
        >
          <Clock size={15} aria-hidden />
          Schedule
        </m.button>
      </div>
    </Overlay>
  );
}
