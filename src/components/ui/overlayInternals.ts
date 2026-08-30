import { useEffect, useRef, type RefObject } from 'react';

/**
 * Shared plumbing for the overlay primitives (Overlay, Sheet, Popover).
 *
 * None of this is new behaviour — it is the same focus handling, scroll lock
 * and Escape wiring that was hand-rolled in ImageViewer, ScribbleSheet, the
 * settings modals and the header menu, pulled into one place so every overlay
 * gets it identically and the components themselves stay about their content.
 */

const FOCUSABLE =
  'a[href],area[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),' +
  'button:not([disabled]),iframe,object,embed,[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';

/**
 * Traps Tab within `containerRef` while `active`, moves focus in on open and
 * restores it to wherever it was on close. On a phone the initial focus is
 * skipped for anything that would pop the keyboard unless asked for explicitly.
 */
export function useFocusTrap(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  initialFocusRef?: RefObject<HTMLElement | null>,
): void {
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    restoreRef.current = document.activeElement as HTMLElement | null;

    // Let the mount animation start before grabbing focus, so the first frame
    // is not janked by a scroll-into-view.
    const raf = requestAnimationFrame(() => {
      const target =
        initialFocusRef?.current ??
        container.querySelector<HTMLElement>(FOCUSABLE) ??
        container;
      target.focus({ preventScroll: true });
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      const activeEl = document.activeElement;
      if (event.shiftKey && (activeEl === first || !container.contains(activeEl))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeEl === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown, true);
      restoreRef.current?.focus({ preventScroll: true });
    };
  }, [active, containerRef, initialFocusRef]);
}

/** Freezes body scroll while `active`. Matches ImageViewer's original guard. */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}

/** Calls `onClose` on Escape while `active`. Registered in the capture phase so
 *  it runs before field-level handlers that also watch Escape. */
export function useEscapeToClose(active: boolean, onClose: () => void): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRef.current();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
    };
  }, [active]);
}

/**
 * Calls `onClose` on a pointerdown outside every element in `refs`. The
 * listener attaches on the next tick so the click that opened the overlay is
 * not the one that closes it — the same guard the old popovers used.
 */
export function useOutsideClose(
  active: boolean,
  onClose: () => void,
  refs: RefObject<HTMLElement | null>[],
): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    let attached = false;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      const inside = refs.some((r) => r.current?.contains(target));
      if (!inside) closeRef.current();
    };
    const id = setTimeout(() => {
      document.addEventListener('pointerdown', onDown, true);
      attached = true;
    }, 0);
    return () => {
      clearTimeout(id);
      if (attached) document.removeEventListener('pointerdown', onDown, true);
    };
    // refs is a stable-length array of stable refs at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
