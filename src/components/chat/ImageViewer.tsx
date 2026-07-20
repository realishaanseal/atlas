import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ImageViewerProps {
  url: string;
  onClose: () => void;
}

/**
 * Fullscreen image preview.
 *
 * Portalled to document.body rather than rendered in place. This matters: the
 * conversation's header and composer use `backdrop-filter`, and an ancestor
 * with a backdrop-filter establishes a containing block for fixed-position
 * descendants — a fixed overlay rendered inside that subtree gets clipped to
 * it instead of covering the viewport.
 *
 * A native <dialog> would handle focus trapping for free, but its behaviour
 * across browsers is inconsistent enough that a predictable overlay with
 * explicit focus handling is the better trade here.
 */
export function ImageViewer({ url, onClose }: ImageViewerProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    // Prevent the conversation scrolling behind the overlay.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus();
    };
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      onClick={onClose}
      className="animate-rise fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4
                 backdrop-blur-sm"
    >
      <img
        src={url}
        alt="Shared image, full size"
        onClick={(event) => {
          // Clicking the image itself should not dismiss.
          event.stopPropagation();
        }}
        className="max-h-full max-w-full rounded-md object-contain"
      />
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Close image preview"
        className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-full
                   bg-surface/90 text-text transition-colors duration-150 hover:bg-surface-raised"
      >
        <X size={18} aria-hidden />
      </button>
    </div>,
    document.body,
  );
}
