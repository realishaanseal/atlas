import { useEffect, useRef, useState } from 'react';
import { m } from 'motion/react';
import { Copy, Check, Pin, PinOff, Pencil } from 'lucide-react';
import { popover } from '@/motion/variants';
import { cn } from '@/utils/cn';

interface MessageMenuProps {
  mine: boolean;
  pinned: boolean;
  canCopy: boolean;
  canEdit: boolean;
  onCopy: () => void;
  onTogglePin: () => void;
  onEdit: () => void;
  onClose: () => void;
}

/**
 * The "more actions" dropdown, opened from the ⋯ button beside reply and react.
 *
 * Holds the actions that are not one-tap reactions: copy, pin, edit. Self-
 * dismissing on an outside click or Escape — the listener is attached on the
 * next tick so the very click that opened the menu is not read as "outside".
 */
export function MessageMenu({
  mine,
  pinned,
  canCopy,
  canEdit,
  onCopy,
  onTogglePin,
  onEdit,
  onClose,
}: MessageMenuProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const attach = setTimeout(() => {
      document.addEventListener('pointerdown', onPointerDown);
    }, 0);

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(attach);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const item =
    'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-secondary ' +
    'transition-colors duration-150 hover:bg-surface hover:text-text';

  return (
    <m.div
      ref={rootRef}
      role="menu"
      variants={popover}
      initial="hidden"
      animate="visible"
      exit="exit"
      style={{ transformOrigin: mine ? 'bottom right' : 'bottom left' }}
      className={cn(
        'glass absolute bottom-full z-40 mb-1 min-w-[10rem] overflow-hidden',
        'rounded-md border border-hairline py-1 depth-lg',
        mine ? 'right-0' : 'left-0',
      )}
    >
      {canCopy && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onCopy();
            // Confirm in place, then close — copying is otherwise invisible.
            setCopied(true);
            setTimeout(onClose, 700);
          }}
          className={item}
        >
          {copied ? (
            <Check size={15} className="text-success" aria-hidden />
          ) : (
            <Copy size={15} aria-hidden />
          )}
          {copied ? 'Copied' : 'Copy text'}
        </button>
      )}

      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onTogglePin();
          onClose();
        }}
        className={item}
      >
        {pinned ? <PinOff size={15} aria-hidden /> : <Pin size={15} aria-hidden />}
        {pinned ? 'Unpin' : 'Pin'}
      </button>

      {canEdit && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onEdit();
            onClose();
          }}
          className={item}
        >
          <Pencil size={15} aria-hidden />
          Edit
        </button>
      )}
    </m.div>
  );
}
