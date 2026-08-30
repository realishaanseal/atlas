import { useRef, type ReactNode, type RefObject } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { useBackClose } from '@/hooks/useBackGuard';
import { popover } from '@/motion/variants';
import { cn } from '@/utils/cn';
import { useEscapeToClose, useOutsideClose } from './overlayInternals';

type Origin = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top' | 'bottom';

const ORIGIN_CLASS: Record<Origin, string> = {
  'top-left': 'origin-top-left',
  'top-right': 'origin-top-right',
  'bottom-left': 'origin-bottom-left',
  'bottom-right': 'origin-bottom-right',
  top: 'origin-top',
  bottom: 'origin-bottom',
};

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /**
   * The trigger's positioned wrapper. Used to place the panel (the panel is
   * `absolute`, so this element must be `relative`) and to know what counts as
   * "inside" for outside-click. Every call site already has this ref.
   */
  anchorRef: RefObject<HTMLElement | null>;
  /** Position classes for the panel, e.g. "right-0 top-12 w-56". */
  className?: string;
  origin?: Origin;
  role?: 'menu' | 'dialog' | 'listbox';
  label?: string;
}

/**
 * A small anchored panel: settings menus, the attach menu, the reaction picker,
 * message actions. Not modal — no backdrop, no focus trap, no scroll lock. It
 * closes on Escape, on a pointerdown outside the trigger or panel, and on the
 * Android back gesture, and it scales out of the corner nearest its trigger.
 *
 * Positioned inline (not portalled): the panel is `absolute` inside the
 * caller's `relative` wrapper, which is also the clip region we want. The one
 * popover that must escape an `overflow-hidden` ancestor — the message receipt
 * panel — keeps its own portalled implementation.
 */
export function Popover({
  open,
  onClose,
  children,
  anchorRef,
  className,
  origin = 'top',
  role,
  label,
}: PopoverProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useBackClose(open, onClose);
  useEscapeToClose(open, onClose);
  useOutsideClose(open, onClose, [anchorRef, panelRef]);

  return (
    <AnimatePresence>
      {open && (
        <m.div
          ref={panelRef}
          {...(role ? { role } : {})}
          {...(label ? { 'aria-label': label } : {})}
          variants={popover}
          initial="hidden"
          animate="visible"
          exit="exit"
          className={cn('absolute z-40', ORIGIN_CLASS[origin], className)}
        >
          {children}
        </m.div>
      )}
    </AnimatePresence>
  );
}
