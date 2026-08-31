import { useEffect, useState } from 'react';
import { Loader2, MonitorSmartphone, X } from 'lucide-react';
import { Overlay } from '@/components/ui/Overlay';

interface PairDeviceModalProps {
  open: boolean;
  onClose: () => void;
}

/** How long the window stays open. Must not exceed the 5 minutes the rules allow. */
const WINDOW_MS = 5 * 60 * 1000;

/**
 * "Add another of my devices."
 *
 * This existed once, was removed when there were only two devices and it looked
 * like clutter, and had to come back the moment there were four. Without it the
 * only way to fill an empty A slot is editing the room document by hand, which
 * is both unpleasant and easy to get wrong — every attempt at it in practice
 * ended with a device in the wrong slot.
 *
 * The mechanism is small: it sets `linkTarget: 'a'` and a five-minute
 * `repairUntil`, and the next device to unlock during that window takes the
 * first empty A slot instead of falling through to deviceB. Without the window,
 * an unknown device is indistinguishable from the other person's, so the app
 * has to assume the safer of the two and hand it slot B.
 *
 * The countdown is not decoration. The window is the only period in which the
 * passphrase alone gets somebody onto YOUR side of the conversation, so it
 * matters that it visibly closes rather than quietly lapsing.
 */
export function PairDeviceModal({ open: isOpen, onClose }: PairDeviceModalProps) {
  const [state, setState] = useState<'idle' | 'opening' | 'open' | 'error'>('idle');
  const [endsAt, setEndsAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (state !== 'open') return;
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [state]);

  const remaining = Math.max(0, endsAt - now);
  const expired = state === 'open' && remaining === 0;

  const open = () => {
    setState('opening');
    void (async () => {
      try {
        const session = await import('@/services/session');
        await session.openLinkWindow();
        setEndsAt(Date.now() + WINDOW_MS);
        setNow(Date.now());
        setState('open');
      } catch {
        setState('error');
      }
    })();
  };

  const mmss = `${String(Math.floor(remaining / 60000))}:${String(
    Math.floor((remaining % 60000) / 1000),
  ).padStart(2, '0')}`;

  return (
    <Overlay open={isOpen} onClose={onClose} label="Add a device" size="w-[min(26rem,94vw)]">
      <div>
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-text">
            <MonitorSmartphone size={15} className="text-accent" aria-hidden />
            Add one of my devices
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
          {state !== 'open' && (
            <>
              <p className="text-[0.8125rem] leading-relaxed text-secondary">
                Opens a five-minute window. The next device to unlock during it joins your side
                rather than the other person&apos;s.
              </p>
              <p className="mt-2 text-[0.8125rem] leading-relaxed text-secondary">
                Have the other device ready with the passphrase before you start, and close the
                window as soon as it has joined.
              </p>

              {state === 'error' && (
                <p className="mt-3 text-xs text-danger">
                  Could not open the window. Check your connection and try again.
                </p>
              )}

              <button
                type="button"
                onClick={open}
                disabled={state === 'opening'}
                className="press mt-4 flex w-full items-center justify-center gap-2 rounded-md
                           bg-accent-solid px-4 py-2.5 text-sm font-medium text-white
                           hover:bg-accent-solid-hover disabled:opacity-60"
              >
                {state === 'opening' && <Loader2 size={15} className="animate-spin" aria-hidden />}
                {state === 'opening' ? 'Opening' : 'Open the window'}
              </button>
            </>
          )}

          {state === 'open' && !expired && (
            <>
              <p className="text-center text-3xl font-semibold tabular-nums text-accent">{mmss}</p>
              <p className="mt-2 text-center text-[0.8125rem] leading-relaxed text-secondary">
                Open the site on the other device now and enter the passphrase. It will join your
                side automatically.
              </p>
              <p className="mt-3 rounded-md bg-surface-raised px-3 py-2 text-xs leading-relaxed text-muted">
                While this is counting down, anyone who knows the passphrase would land on your side
                rather than being turned away. It closes on its own.
              </p>
            </>
          )}

          {expired && (
            <>
              <p className="text-center text-[0.8125rem] text-secondary">
                The window has closed.
              </p>
              <button
                type="button"
                onClick={open}
                className="press mt-4 w-full rounded-md bg-accent-solid px-4 py-2.5 text-sm
                           font-medium text-white hover:bg-accent-solid-hover"
              >
                Open it again
              </button>
            </>
          )}
        </div>
      </div>
    </Overlay>
  );
}
