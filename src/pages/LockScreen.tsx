import { useId, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { APP_NAME } from '@/config';
import { assessPassphrase, generatePassphrase } from '@/crypto/strength';
import { cn } from '@/utils/cn';
import type { SessionStatus } from '@/hooks/useSession';

interface LockScreenProps {
  status: SessionStatus;
  message: string | null;
  onSubmit: (passphrase: string) => void | Promise<void>;
}

/**
 * The lock screen.
 *
 * Nothing here suggests a messenger. No logo, no product copy, no hint in the
 * tab title. Someone glancing over your shoulder sees a workspace login.
 *
 * A real <form> rather than a keydown handler, so password managers, mobile
 * keyboards and Enter-to-submit all behave natively. `current-password` is
 * intentional: letting a manager fill this meaningfully raises the passphrase
 * strength people will tolerate, which matters a lot in a design with no
 * forward secrecy.
 */
export default function LockScreen({ status, message, onSubmit }: LockScreenProps) {
  const [value, setValue] = useState('');
  const inputId = useId();
  const messageId = useId();

  const isSetup = status === 'setup';
  const busy = status === 'working' || status === 'checking';

  const assessment = useMemo(
    () => (isSetup && value.length > 0 ? assessPassphrase(value) : null),
    [isSetup, value],
  );

  const canSubmit =
    value.length > 0 && !busy && (!isSetup || (assessment?.acceptable ?? false));

  return (
    <main className="relative flex min-h-full items-center justify-center px-6 pt-safe pb-safe">
      {/* Breathing glow behind the card. Sits under the content and is purely
          decorative, so it never intercepts pointer events. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 size-[420px] -translate-x-1/2
                   -translate-y-1/2 rounded-full bg-accent-solid/20 blur-[100px]"
        style={{ animation: 'pulse-glow 6s var(--ease-soft) infinite' }}
      />

      <div className="animate-rise relative w-full max-w-[360px]">
        <div className="glass edge-light rounded-xl border border-border p-7 shadow-lift">
          <header className="mb-8 text-center">
            <h1 className="text-[1.5rem] font-semibold tracking-[-0.03em]">{APP_NAME}</h1>
            <p className="mt-2 text-sm text-secondary">
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
            <input
              id={inputId}
              type="password"
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
              aria-describedby={message !== null || assessment !== null ? messageId : undefined}
              aria-invalid={message !== null || undefined}
              className={cn(
                'h-12 w-full rounded-md border bg-surface/70 px-4 text-base text-text',
                'backdrop-blur-sm placeholder:text-muted focus:outline-none disabled:opacity-60',
                'transition-[border-color,box-shadow] duration-200 ease-soft',
                message
                  ? 'border-danger focus:border-danger'
                  : 'border-border hover:border-border-strong focus:border-accent focus:shadow-glow',
              )}
            />
          </div>

          {isSetup && (
            <button
              type="button"
              onClick={() => {
                setValue(generatePassphrase());
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

          <Button type="submit" className="w-full" disabled={!canSubmit} loading={busy}>
            {busy ? (
              <>
                <Loader2 size={15} className="animate-spin" aria-hidden />
                {status === 'working' ? 'Unlocking' : 'Loading'}
              </>
            ) : isSetup ? (
              'Create workspace'
            ) : (
              'Unlock'
            )}
          </Button>

          <p
            id={messageId}
            role={message ? 'alert' : 'status'}
            aria-live="polite"
            className={cn(
              'min-h-[1.25rem] text-xs',
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
            This password encrypts everything and is never stored or sent anywhere. If you lose
            it, the conversation cannot be recovered.
          </p>
        )}
      </div>
    </main>
  );
}
