import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/cn';

type Variant = 'primary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  children: ReactNode;
}

const base =
  'group relative inline-flex items-center justify-center gap-2 overflow-hidden ' +
  'rounded-md px-4 text-sm font-medium select-none press ' +
  'disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none';

const variants: Record<Variant, string> = {
  // The gradient runs slightly lighter at the top, which reads as a lit
  // surface rather than a flat fill. The glow shadow is what makes it look
  // like it's sitting above the page instead of painted onto it.
  primary:
    'bg-gradient-to-b from-accent-solid to-accent-solid-deep text-white ' +
    'shadow-glow hover:shadow-glow-strong hover:from-accent-solid-hover hover:to-accent-solid',
  ghost: 'text-secondary hover:text-text hover:bg-surface-raised',
};

export function Button({
  variant = 'primary',
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled === true || loading;

  return (
    <button
      className={cn(base, variants[variant], 'h-11', className)}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      {...rest}
    >
      {/* Light sweep on hover. Purely decorative, so it is aria-hidden and
          sits behind the label. */}
      {variant === 'primary' && !isDisabled && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-md"
        >
          <span
            className="absolute inset-y-0 w-1/3 bg-white/20 blur-md opacity-0
                       group-hover:opacity-100 group-hover:[animation:shimmer_900ms_ease-out]"
          />
        </span>
      )}
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
    </button>
  );
}
