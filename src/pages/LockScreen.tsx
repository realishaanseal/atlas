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

/** The session hook reports failures as codes; this is where they get words. */
function describe(reason: SessionReason): string {
  switch (reason.kind) {
    case 'bad-passphrase':
      return 'Incorrect password.';
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
 * The lock screen.
 *
 * Two forms in one: establishing a passphrase when none exists — once at first
 * run, and again after a rotation — and unlocking with it every time after.
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
 * This is the one screen seen cold, with nothing else on it, so it sets the
 * tone — and does it with material rather than motion: an embossed card on
 * plain ink, a field pressed into it. The only movement is functional (the
 * card arriving, a shake on a wrong password), and the global reduced-motion
 * rule disables both.
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

  const strength = assessment?.level ?? null;
  const strengthSteps = strength === 'strong' ? 3 : strength === 'fair' ? 2 : value.length > 0 ? 1 : 0;

  return (
    <main className="relative flex min-h-full items-center justify-center overflow-hidden px-6 pt-safe pb-safe">
      <div className="animate-scale-in relative w-full max-w-[360px]">
        {/* One embossed card on plain ink. Nothing behind it moves or glows:
            the material of the card is the whole effect. */}
        <div
          onAnimationEnd={() => {
            setShaking(false);
          }}
          className={cn(
            'sheen edge-light rounded-xl border border-hairline bg-surface p-7 depth-lg',
            shaking && 'animate-shake',
          )}
        >
          <header className="mb-7 flex flex-col items-center text-center">
            {/* The padlock is the one piece of state you can read at a glance:
                closed at rest, open while the key is being derived. */}
            <span
              className={cn(
                'mb-3 flex size-12 items-center justify-center rounded-full border transition-all',
                'duration-500 ease-spring',
                busy
                  ? 'border-accent/60 bg-accent-muted/40 text-accent'
                  : focused
                    ? 'border-accent/60 bg-surface-raised text-accent'
                    : 'border-hairline bg-surface-raised text-secondary',
              )}
            >
              {busy ? <LockOpen size={20} aria-hidden /> : <Lock size={20} aria-hidden />}
            </span>

            <h1 className="text-[1.75rem] font-medium leading-none tracking-[-0.02em]">
              {APP_NAME}
            </h1>
            <p className="mono mt-2.5 text-muted">
              {isSetup ? 'Choose a password to begin' : 'Private workspace'}
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
                    'h-12 w-full rounded-md border bg-bg pl-4 pr-11 text-base text-text shadow-inset',
                    'placeholder:text-muted focus:outline-none disabled:opacity-60',
                    'transition-[border-color,box-shadow,transform] duration-200 ease-soft',
                    message
                      ? 'border-danger focus:border-danger'
                      : 'border-hairline hover:border-hairline-strong focus:border-accent/70',
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
                          : 'bg-hairline',
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
              className="w-full"
              disabled={!canSubmit}
              loading={busy}
            >
              {busy ? (
                <>
                  <Loader2 size={15} className="animate-spin" aria-hidden />
                  {status === 'working' ? 'Unlocking' : 'Loading'}
                </>
              ) : isSetup ? (
                'Set password'
              ) : (
                'Unlock'
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
            This password encrypts everything and is never stored or sent anywhere. If you lose it,
            nothing behind it can be recovered.
          </p>
        )}
      </div>
    </main>
  );
}
