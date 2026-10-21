import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m, useDragControls, useReducedMotion, type PanInfo } from 'motion/react';
import { useBackClose } from '@/hooks/useBackGuard';
import { backdrop, sheetUp } from '@/motion/variants';
import { cn } from '@/utils/cn';
import { useEscapeToClose, useFocusTrap, useScrollLock } from './overlayInternals';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label?: string;
  labelledBy?: string;
  /** Classes for the panel (usually just a max-width or padding). */
  className?: string;
  /** Show the drag handle. On by default; off for a sheet that fills the screen. */
  handle?: boolean;
}

/** Drag past this (px) or fling faster than this (px/s) to dismiss on release. */
const DISMISS_OFFSET = 96;
const DISMISS_VELOCITY = 480;

/**
 * A bottom sheet you can flick away.
 *
 * Drag is bound to the handle rather than the whole panel (`dragListener=false`
 * + a controls.start on the grip), so a scrollable body — an emoji grid, a
 * settings list — still scrolls normally and only the handle pulls the sheet
 * down. Past the threshold, or on a fast enough downward fling, release closes
 * it; short of that it springs back. Reduced motion turns the gesture off
 * entirely and the sheet just fades.
 *
 * Same portal / focus-trap / scroll-lock / back-gesture wiring as Overlay.
 */
export function Sheet({
  open,
  onClose,
  children,
  label,
  labelledBy,
  className,
  handle = true,
}: SheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const controls = useDragControls();
  const reduce = useReducedMotion() ?? false;

  useBackClose(open, onClose);
  useScrollLock(open);
  useEscapeToClose(open, onClose);
  useFocusTrap(open, panelRef);

  const onDragEnd = (_event: unknown, info: PanInfo) => {
    if (info.offset.y > DISMISS_OFFSET || info.velocity.y > DISMISS_VELOCITY) onClose();
  };

  const startDrag = (event: ReactPointerEvent) => {
    if (!reduce) controls.start(event);
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <m.div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <m.div
            aria-hidden
            variants={backdrop}
            onClick={onClose}
            className="absolute inset-0 bg-bg-deep/70 backdrop-blur-md"
          />
          <m.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            {...(label ? { 'aria-label': label } : {})}
            {...(labelledBy ? { 'aria-labelledby': labelledBy } : {})}
            variants={sheetUp}
            drag={reduce ? false : 'y'}
            dragListener={false}
            dragControls={controls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.55 }}
            onDragEnd={onDragEnd}
            className={cn(
              'relative z-10 mx-auto flex max-h-[92vh] w-full flex-col overflow-hidden',
              'sheen rounded-t-xl border-t border-hairline bg-surface pb-safe depth-lg',
              className,
            )}
          >
            {handle && (
              <div
                onPointerDown={startDrag}
                className="flex shrink-0 cursor-grab touch-none justify-center pt-2.5 pb-1.5 active:cursor-grabbing"
                aria-hidden
              >
                <span className="h-1 w-9 rounded-full bg-hairline-strong" />
              </div>
            )}
            {children}
          </m.div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
