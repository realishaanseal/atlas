import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarPlus, Clock, Download } from 'lucide-react';
import { relativeLabel } from '@/utils/datetime';
import { downloadIcs, googleCalendarUrl } from '@/utils/calendar';
import { useBackClose } from '@/hooks/useBackGuard';
import { cn } from '@/utils/cn';

interface DateChipProps {
  /** The phrase exactly as written. Never rewritten — see below. */
  label: string;
  /** Resolved moment. */
  at: number;
  hasTime: boolean;
  /** The whole message, used as the event title. */
  title: string;
}

/**
 * A date or time inside a message, made live.
 *
 * The words are NOT rewritten. It would be easy to swap "tomorrow at 5" for
 * "in 4 hours" as the clock moves, and it looks clever in a mockup — but it
 * means the two of you would be reading different sentences, the archive would
 * disagree with what was actually sent, and a quoted reply would no longer
 * match its original. So the phrase stays put and the countdown lives beside
 * it, updating on its own.
 *
 * Tapping opens the resolved date and the two calendar routes.
 */
export function DateChip({ label, at, hasTime, title }: DateChipProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);

  // Ticks so the relative label stays honest. A minute is plenty — nothing
  // here is second-precise, and a faster timer would re-render every bubble.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 60_000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  useBackClose(open, () => {
    setOpen(false);
  });

  const relative = relativeLabel(at, now);
  const past = at < now;

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        aria-label={`${label} — ${relative}. Add to calendar`}
        className={cn(
          'rounded px-0.5 font-medium underline decoration-dotted underline-offset-2',
          'transition-colors hover:bg-black/10',
          past && 'opacity-70',
        )}
      >
        {label}
      </button>

      {open && (
        <DatePopover
          anchorRef={anchorRef}
          at={at}
          hasTime={hasTime}
          title={title}
          relative={relative}
          onClose={() => {
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function DatePopover({
  anchorRef,
  at,
  hasTime,
  title,
  relative,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  at: number;
  hasTime: boolean;
  title: string;
  relative: string;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);

  // Portalled and fixed, for the same reason the receipt popover is: the bubble
  // is overflow-hidden, so anything absolute inside it gets clipped.
  useLayoutEffect(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({
      left: Math.min(Math.max(8, rect.left), window.innerWidth - 248),
      bottom: Math.max(8, window.innerHeight - rect.top + 6),
    });
  }, [anchorRef]);

  useEffect(() => {
    const attach = setTimeout(() => {
      document.addEventListener('pointerdown', onDown);
    }, 0);
    function onDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    const onScroll = () => {
      onClose();
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      clearTimeout(attach);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose]);

  if (!pos) return null;

  const absolute = new Date(at).toLocaleString([], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(hasTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });

  const event = { title: title.slice(0, 120), at, hasTime };

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-label="Date"
      style={{ left: pos.left, bottom: pos.bottom }}
      className="glass animate-scale-in fixed z-[60] w-60 origin-bottom-left rounded-md border
                 border-border p-2.5 shadow-lift"
    >
      <p className="text-sm font-medium text-text">{absolute}</p>
      <p className="mb-2.5 flex items-center gap-1.5 text-[0.6875rem] text-accent">
        <Clock size={11} aria-hidden />
        {relative}
      </p>

      <a
        href={googleCalendarUrl(event)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClose}
        className="press mb-1 flex w-full items-center gap-2 rounded-md bg-surface-raised px-2.5 py-2
                   text-xs text-text hover:bg-surface"
      >
        <CalendarPlus size={14} className="text-accent" aria-hidden />
        Google Calendar
      </a>

      <button
        type="button"
        onClick={() => {
          downloadIcs(event);
          onClose();
        }}
        className="press flex w-full items-center gap-2 rounded-md bg-surface-raised px-2.5 py-2
                   text-xs text-text hover:bg-surface"
      >
        <Download size={14} className="text-accent" aria-hidden />
        Add to calendar app
      </button>
    </div>,
    document.body,
  );
}
