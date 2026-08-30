import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Loader2, Lock, LockOpen, RefreshCw, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { APP_NAME } from '@/config';
import { assessPassphrase, generatePassphrase } from '@/crypto/strength';
import { cn } from '@/utils/cn';
import type { SessionReason, SessionStatus } from '@/hooks/useSession';

interface LockScreenProps {
  status: SessionStatus;
  reason: SessionReason | null;
  onSubmit: (passphrase: string) => void | Promise<void>;
}

/**
 * Wording lives here rather than in the session hook.
 *
 * The hook is eagerly loaded and its strings ship to every visitor of the
 * public site; this screen is lazy and only ever reached deliberately, so it is
 * free to say "passphrase" out loud.
 */
function describe(reason: SessionReason): string {
  switch (reason.kind) {
    case 'bad-code':
      return 'Incorrect passphrase.';
    case 'rate-limited':
      return reason.seconds > 0
        ? `Too many attempts. Wait ${String(reason.seconds)}s.`
        : 'Too many attempts. Wait a moment.';
    case 'network':
      return 'Could not reach the workspace. Check your connection.';
    default:
      return 'Something went wrong. Try again.';
  }
}

/**
 * The passphrase screen.
 *
 * No longer the front door — the public site is, and its access-code field
 * handles every ordinary unlock. This screen survives for the one case that
 * field deliberately refuses to serve: establishing a passphrase when none
 * exists, which happens exactly once at first run and again after a rotation.
 * It lives at the unlisted route in cover/CoverSite.tsx and 404s otherwise.
 *
 * Nothing here suggests a messenger. No logo, no product copy, no hint in the
 * tab title. Someone glancing over your shoulder sees a workspace login.
 *
 * A real <form> rather than a keydown handler, so password managers, mobile
 * keyboards and Enter-to-submit all behave natively. `current-password` is
 * intentional: letting a manager fill this meaningfully raises the passphrase
 * strength people will tolerate, which matters a lot in a design with no
 * forward secrecy.
 *
 * The motion here is deliberately richer than the rest of the app: this is the
 * one screen seen cold, with nothing else on it, and it sets the tone. Every
 * effect is transform/opacity only, and all of it is disabled by the global
 * reduced-motion rule.
 */
export default function LockScreen({ status, reason, onSubmit }: LockScreenProps) {
  const message = reason === null ? null : describe(reason);
  const [value, setValue] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [focused, setFocused] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const inputId = useId();
  const messageId = useId();

  const isSetup = status === 'setup';
  const busy = status === 'working' || status === 'checking';

  const assessment = useMemo(
    () => (isSetup && value.length > 0 ? assessPassphrase(value) : null),
    [isSetup, value],
  );

  const canSubmit = value.length > 0 && !busy && (!isSetup || (assessment?.acceptable ?? false));

  /**
   * Shake the card when an error arrives.
   *
   * The class is removed and re-added across a frame rather than the element
   * being re-keyed. Re-keying would remount the card — and with it the input —
   * losing focus after every wrong attempt, which is exactly when you least
   * want to have to click back into the field. Clearing on animationend also
   * lets two identical errors in a row each shake.
   */
  const [shaking, setShaking] = useState(false);
  const previousMessage = useRef<string | null>(null);
  useEffect(() => {
    if (message !== null && message !== previousMessage.current) {
      setShaking(false);
      requestAnimationFrame(() => {
        setShaking(true);
      });
    }
    previousMessage.current = message;
  }, [message]);

  /**
   * Pointer parallax. The card tilts a few degrees toward the cursor, which
   * makes the glass read as a physical pane rather than a flat rectangle.
   * Fine pointers only — on touch there is no hover, and a tilt that only
   * happens mid-drag is just noise.
   */
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const onPointerMove = (event: React.PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: -py * 6, y: px * 6 });
  };

  const strength = assessment?.level ?? null;
  const strengthSteps = strength === 'strong' ? 3 : strength === 'fair' ? 2 : value.length > 0 ? 1 : 0;

  return (
    <main className="relative flex min-h-full items-center justify-center overflow-hidden px-6 pt-safe pb-safe">
      {/* Two drifting glows rather than one. A single pulsing circle reads as a
          spotlight; two, moving at different rates, read as depth. Decorative
          and non-interactive. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 size-[420px] -translate-x-1/2
                   -translate-y-1/2 rounded-full bg-accent-solid/20 blur-[100px]"
        style={{ animation: 'pulse-glow 6s var(--ease-soft) infinite' }}
      />
      <div
        aria-hidden
        className="animate-float pointer-events-none absolute left-1/2 top-1/2 size-[300px]
                   -translate-x-[30%] -translate-y-[70%] rounded-full blur-[90px]"
        style={{ backgroundColor: 'color-mix(in oklab, var(--glow-b) 22%, transparent)' }}
      />

      <div className="animate-scale-in relative w-full max-w-[360px]">
        <div
          ref={cardRef}
          onPointerMove={onPointerMove}
          onPointerLeave={() => {
            setTilt({ x: 0, y: 0 });
          }}
          onAnimationEnd={() => {
            setShaking(false);
          }}
          className={cn(
            'glass edge-light rounded-xl border border-border p-7 shadow-lift',
            'transition-[transform,box-shadow] duration-300 ease-soft',
            shaking && 'animate-shake',
          )}
          style={{
            transform: `perspective(900px) rotateX(${String(tilt.x)}deg) rotateY(${String(tilt.y)}deg)`,
          }}
        >
          <header className="mb-7 flex flex-col items-center text-center">
            {/* The padlock is the one piece of state you can read at a glance:
                closed at rest, open while the key is being derived. */}
            <span
              className={cn(
                'mb-3 flex size-12 items-center justify-center rounded-full border transition-all',
                'duration-500 ease-spring',
                busy
                  ? 'scale-105 border-accent bg-accent-muted/40 text-accent shadow-glow'
                  : focused
                    ? 'border-accent/60 bg-surface-raised text-accent'
                    : 'border-border bg-surface-raised text-secondary',
              )}
            >
              {busy ? <LockOpen size={20} aria-hidden /> : <Lock size={20} aria-hidden />}
            </span>

            <h1 className="text-[1.5rem] font-semibold tracking-[-0.03em]">{APP_NAME}</h1>
            <p className="mt-1.5 text-sm text-secondary">
              {isSetup ? 'Set the admin passphrase' : 'Restore access'}
            </p>
          </header>

          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (canSubmit) void onSubmit(value);
            }}
          >
            <div className="space-y-2">
              <label htmlFor={inputId} className="block text-xs font-medium text-secondary">
                Password
              </label>

              <div className="relative">
                <input
                  id={inputId}
                  type={revealed ? 'text' : 'password'}
                  autoComplete={isSetup ? 'new-password' : 'current-password'}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  autoFocus
                  disabled={busy}
                  value={value}
                  onChange={(event) => {
                    setValue(event.target.value);
                  }}
                  onFocus={() => {
                    setFocused(true);
                  }}
                  onBlur={() => {
                    setFocused(false);
                    setCapsOn(false);
                  }}
                  onKeyUp={(event) => {
                    setCapsOn(event.getModifierState('CapsLock'));
                  }}
                  aria-describedby={message !== null || assessment !== null ? messageId : undefined}
                  aria-invalid={message !== null || undefined}
                  className={cn(
                    'h-12 w-full rounded-md border bg-surface/70 pl-4 pr-11 text-base text-text',
                    'backdrop-blur-sm placeholder:text-muted focus:outline-none disabled:opacity-60',
                    'transition-[border-color,box-shadow,transform] duration-200 ease-soft',
                    message
                      ? 'border-danger focus:border-danger'
                      : 'border-border hover:border-border-strong focus:border-accent focus:shadow-glow',
                  )}
                />

                {/* Reveal toggle. Genuinely useful on a phone keyboard, and the
                    one control here people expect to be able to poke. */}
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => {
                    setRevealed((shown) => !shown);
                  }}
                  aria-label={revealed ? 'Hide password' : 'Show password'}
                  className="press absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2
                             items-center justify-center rounded-full text-muted
                             hover:bg-surface-raised hover:text-accent"
                >
                  {revealed ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
                </button>
              </div>

              {/* Strength meter, setup only. Three segments filling with colour
                  is readable at a glance in a way a sentence is not. */}
              {isSetup && (
                <div className="flex gap-1.5 pt-0.5" aria-hidden>
                  {[0, 1, 2].map((index) => (
                    <span
                      key={index}
                      className={cn(
                        'h-1 flex-1 rounded-full transition-all duration-500 ease-spring',
                        index < strengthSteps
                          ? strength === 'strong'
                            ? 'bg-success'
                            : strength === 'fair'
                              ? 'bg-accent'
                              : 'bg-danger'
                          : 'bg-border',
                      )}
                    />
                  ))}
                </div>
              )}

              {capsOn && (
                <p className="animate-rise flex items-center gap-1.5 text-[0.6875rem] text-amber-400">
                  <ShieldAlert size={12} aria-hidden />
                  Caps Lock is on
                </p>
              )}
            </div>

            {isSetup && (
              <button
                type="button"
                onClick={() => {
                  setValue(generatePassphrase());
                  setRevealed(true);
                }}
                className="group flex items-center gap-1.5 text-xs text-secondary transition-colors
                           duration-200 hover:text-accent"
              >
                <RefreshCw
                  size={12}
                  aria-hidden
                  className="transition-transform duration-500 ease-spring group-hover:rotate-180"
                />
                Generate a strong password
              </button>
            )}

            <Button
              type="submit"
              className={cn('w-full', canSubmit && 'animate-gradient bg-[length:200%_200%]')}
              disabled={!canSubmit}
              loading={busy}
            >
              {busy ? (
                <>
                  <Loader2 size={15} className="animate-spin" aria-hidden />
                  {status === 'working' ? 'Unlocking' : 'Loading'}
                </>
              ) : isSetup ? (
                'Set code'
              ) : (
                'Continue'
              )}
            </Button>

            <p
              id={messageId}
              role={message ? 'alert' : 'status'}
              aria-live="polite"
              className={cn(
                'min-h-[1.25rem] text-xs transition-colors duration-200',
                message
                  ? 'text-danger'
                  : assessment?.level === 'strong'
                    ? 'text-success'
                    : 'text-secondary',
              )}
            >
              {message ?? assessment?.message ?? ''}
            </p>
          </form>
        </div>

        {isSetup && (
          <p className="mt-5 text-center text-xs leading-relaxed text-muted">
            This code encrypts everything and is never stored or sent anywhere. If you lose it,
            nothing behind it can be recovered.
          </p>
        )}
      </div>
    </main>
  );
}
