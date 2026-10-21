import { ShieldOff } from 'lucide-react';
import { APP_NAME } from '@/config';

/**
 * Shown when both device slots are already occupied.
 *
 * Deliberately terse. It does not say how many devices exist, who they are, or
 * how to get in — the only recovery path is opening a re-pair window from one
 * of the two paired devices, which someone with legitimate access already
 * knows about.
 */
export default function UnpairedScreen() {
  return (
    <main className="flex min-h-full items-center justify-center px-6 pt-safe pb-safe">
      <div className="animate-rise w-full max-w-[340px] text-center">
        <div
          className="mx-auto mb-5 flex size-11 items-center justify-center rounded-full
                     bg-surface text-secondary"
        >
          <ShieldOff size={18} aria-hidden />
        </div>
        <h1 className="text-[1.375rem] font-semibold tracking-[-0.02em]">{APP_NAME}</h1>
        <p className="mt-2 text-sm text-secondary">This device is not paired.</p>
        <p className="mt-6 text-xs leading-relaxed text-muted">
          To use this device, open Settings on a device that is already paired and allow a new
          device.
        </p>
      </div>
    </main>
  );
}
