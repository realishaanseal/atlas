import { useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m } from 'motion/react';
import { useBackClose } from '@/hooks/useBackGuard';
import { backdrop, scaleIn } from '@/motion/variants';
import { cn } from '@/utils/cn';
import { useEscapeToClose, useFocusTrap, useScrollLock } from './overlayInternals';

interface OverlayProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Accessible name for the dialog. One of label / labelledBy should be set. */
  label?: string;
  labelledBy?: string;
  /** Classes for the panel itself (sizing, layout). */
  className?: string;
  /** Focus this on open instead of the panel's first focusable. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Panel width/height box. Override for anything that isn't a small dialog. */
  size?: string;
  /** Dim + blur behind the panel. Off for overlays meant to sit over live content. */
  dim?: boolean;
  /** Skip the default panel chrome (border/background/shadow) — caller styles everything. */
  bare?: boolean;
}

/**
 * A centred modal dialog.
 *
 * Always mounted; driven by `open`. That is what lets the exit animation run —
 * `{open && <Overlay/>}` would tear the component (and its AnimatePresence)
 * down before it could play. Portalled to <body> because the header and
 * composer use backdrop-filter, and a backdrop-filter ancestor clips fixed
 * descendants to itself (the reason ImageViewer has always portalled).
 *
 * Focus trap, scroll lock, Escape, outside-click and the Android back gesture
 * (useBackClose) are all wired here so every modal in the app behaves the same.
 */
export function Overlay({
  open,
  onClose,
  children,
  label,
  labelledBy,
  className,
  initialFocus,
  size = 'max-h-[min(88vh,44rem)] w-[min(28rem,94vw)]',
  dim = true,
  bare = false,
}: OverlayProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useBackClose(open, onClose);
  useScrollLock(open);
  useEscapeToClose(open, onClose);
  useFocusTrap(open, panelRef, initialFocus);

  return createPortal(
    <AnimatePresence>
      {open && (
        <m.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <m.div
            aria-hidden
            variants={backdrop}
            onClick={onClose}
            className={cn('absolute inset-0', dim && 'bg-bg-deep/70 backdrop-blur-md')}
          />
          <m.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            {...(label ? { 'aria-label': label } : {})}
            {...(labelledBy ? { 'aria-labelledby': labelledBy } : {})}
            variants={scaleIn}
            className={cn(
              'relative z-10 overflow-hidden',
              size,
              !bare && 'rounded-lg border border-hairline bg-surface shadow-raised',
              className,
            )}
          >
            {children}
          </m.div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
