import { useCallback, useRef, useState } from 'react';

const TRIGGER_PX = 56;
const MAX_PX = 84;
/** Below this the gesture is treated as a scroll, not a swipe. */
const DIRECTION_LOCK_PX = 10;

/**
 * Swipe-right-to-reply.
 *
 * The subtle part is direction locking. A message list is a vertical scroller,
 * so a gesture that starts ambiguously must be given to the scroller, not
 * stolen by us. We watch the first few pixels: if vertical movement dominates,
 * we bail out permanently for that gesture. Get this wrong and scrolling feels
 * broken, which is far more annoying than a missing shortcut.
 *
 * Resistance is applied past the trigger point so the bubble slows rather than
 * sliding freely — that physical hint tells you the gesture has registered
 * without needing a label.
 */
export function useSwipeToReply(onReply: () => void, enabled = true) {
  const [offset, setOffset] = useState(0);
  const [armed, setArmed] = useState(false);

  const startX = useRef(0);
  const startY = useRef(0);
  const decision = useRef<'undecided' | 'horizontal' | 'vertical'>('undecided');
  const pointerId = useRef<number | null>(null);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      // Mouse users get a hover button instead; swiping with a mouse is not a
      // gesture anyone reaches for.
      if (!enabled || event.pointerType === 'mouse') return;
      startX.current = event.clientX;
      startY.current = event.clientY;
      decision.current = 'undecided';
      pointerId.current = event.pointerId;
    },
    [enabled],
  );

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    if (pointerId.current !== event.pointerId) return;

    const dx = event.clientX - startX.current;
    const dy = event.clientY - startY.current;

    if (decision.current === 'undecided') {
      if (Math.abs(dx) < DIRECTION_LOCK_PX && Math.abs(dy) < DIRECTION_LOCK_PX) return;
      // Vertical wins ties — scrolling is the more common intent.
      decision.current = Math.abs(dx) > Math.abs(dy) * 1.4 ? 'horizontal' : 'vertical';
    }

    if (decision.current !== 'horizontal' || dx <= 0) return;

    // Rubber-band past the trigger: full speed up to TRIGGER_PX, then a third
    // of it, so the bubble visibly resists.
    const eased =
      dx <= TRIGGER_PX ? dx : TRIGGER_PX + Math.min((dx - TRIGGER_PX) / 3, MAX_PX - TRIGGER_PX);

    setOffset(eased);
    setArmed(dx >= TRIGGER_PX);
  }, []);

  const finish = useCallback(() => {
    if (armed) onReply();
    setOffset(0);
    setArmed(false);
    decision.current = 'undecided';
    pointerId.current = null;
  }, [armed, onReply]);

  return {
    offset,
    armed,
    swiping: offset > 0,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
    },
  };
}
