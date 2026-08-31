import { useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  AnimatePresence,
  m,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from 'motion/react';
import { X } from 'lucide-react';
import { springs } from '@/motion/springs';
import { useEscapeToClose, useFocusTrap, useScrollLock } from '@/components/ui/overlayInternals';

interface ImageViewerProps {
  url: string | null;
  onClose: () => void;
}

/** Drag the image this far (px) in any direction to dismiss on release. */
const DISMISS_DISTANCE = 120;

/**
 * Fullscreen image preview.
 *
 * Portalled to <body>: the conversation's header and composer use
 * backdrop-filter, and a backdrop-filter ancestor clips fixed descendants to
 * itself. The image can be flicked away in any direction — the backdrop fades
 * with the throw, so letting go past the threshold feels like dropping it out
 * of frame rather than closing a dialog. Reduced motion keeps the tap/Escape
 * paths and drops the drag.
 */
export function ImageViewer({ url, onClose }: ImageViewerProps) {
  const open = url !== null;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const reduce = useReducedMotion() ?? false;

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const distance = useTransform(() => Math.hypot(x.get(), y.get()));
  const backdropOpacity = useTransform(distance, [0, 260], [1, 0]);
  const imageOpacity = useTransform(distance, [0, 260], [1, 0.4]);

  useScrollLock(open);
  useEscapeToClose(open, onClose);
  useFocusTrap(open, panelRef, closeRef);

  const onDragEnd = (_event: unknown, info: PanInfo) => {
    if (Math.hypot(info.offset.x, info.offset.y) > DISMISS_DISTANCE) onClose();
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <m.div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={springs.gentle}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <m.div
            aria-hidden
            style={{ opacity: reduce ? 1 : backdropOpacity }}
            className="absolute inset-0 bg-black/92 backdrop-blur-md"
          />
          <m.img
            src={url}
            alt="Shared image, full size"
            onClick={(event) => {
              event.stopPropagation();
            }}
            drag={reduce ? false : true}
            dragSnapToOrigin
            dragElastic={0.6}
            onDragEnd={onDragEnd}
            style={{ x, y, opacity: reduce ? 1 : imageOpacity }}
            initial={{ scale: 0.94 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.96 }}
            transition={springs.glass}
            className="relative max-h-full max-w-full cursor-grab rounded-md object-contain
                       shadow-raised active:cursor-grabbing"
          />
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close image preview"
            className="press glass absolute right-4 top-4 flex size-10 items-center justify-center
                       rounded-full border border-hairline text-text"
          >
            <X size={18} aria-hidden />
          </button>
        </m.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
