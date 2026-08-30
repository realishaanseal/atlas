import { useEffect, useRef, useState } from 'react';

/**
 * Android's back gesture, made to behave like a native app.
 *
 * The problem: a web app has no concept of "screens", so the system back
 * gesture goes straight to browser history — and in a PWA launched from the
 * home screen there is usually nothing behind the app, so one careless swipe
 * while a photo is open closes the whole thing.
 *
 * The fix has two halves:
 *
 *   1. A guard entry is kept on the history stack at all times. Back pops the
 *      guard instead of leaving the page, we handle it ourselves, and then push
 *      a fresh guard so there is always one more to consume.
 *
 *   2. Anything that is "open" — a viewer, a sheet, a menu, a popover —
 *      registers a close handler here. Back closes the topmost one, exactly
 *      like a native back stack. Only when nothing is open does back mean
 *      "leave", and even then it takes two within a couple of seconds.
 *
 * The login screen is never reachable by going back: the app is one page, so
 * unlocking is state rather than navigation, and the guard keeps the page
 * itself from being popped.
 */

interface Entry {
  close: () => void;
}

/**
 * Open overlays, innermost last.
 *
 * Module-scoped rather than context: this is consulted inside a `popstate`
 * listener that must see the CURRENT stack, and threading a provider through
 * every popover in the app to achieve that would be a lot of plumbing for no
 * extra correctness.
 */
const stack: Entry[] = [];

/**
 * Registers something dismissible with the back gesture.
 *
 * `active` is the open flag; the handler is removed automatically when it goes
 * false or the component unmounts, so nothing has to be cleaned up by hand.
 */
export function useBackClose(active: boolean, close: () => void): void {
  // Held in a ref so a re-created closure does not churn the registration —
  // otherwise every parent render would pop and re-push this entry, quietly
  // reordering the stack.
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!active) return;

    const entry: Entry = {
      close: () => {
        closeRef.current();
      },
    };
    stack.push(entry);

    return () => {
      const index = stack.indexOf(entry);
      if (index !== -1) stack.splice(index, 1);
    };
  }, [active]);
}

/** How long the second back has to arrive to actually exit. */
const EXIT_WINDOW_MS = 2500;

/**
 * Installs the guard. Called once, from the conversation — so it exists only
 * while unlocked, and an unlocked session can never be backed out of into the
 * password screen.
 *
 * Returns whether the "press again to exit" hint should be showing.
 */
export function useBackGuard(): boolean {
  const [exitHint, setExitHint] = useState(false);

  useEffect(() => {
    const pushGuard = () => {
      window.history.pushState({ guard: true }, '');
    };

    pushGuard();

    let armed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const onPop = () => {
      const top = stack[stack.length - 1];

      if (top) {
        // Something is open: consume the back, close it, and restore the guard.
        stack.pop();
        pushGuard();
        top.close();
        return;
      }

      if (armed) {
        // Second back inside the window — let it through. The guard has already
        // been consumed by this pop, so one more step actually leaves.
        armed = false;
        setExitHint(false);
        window.history.back();
        return;
      }

      armed = true;
      setExitHint(true);
      pushGuard();
      timer = setTimeout(() => {
        armed = false;
        setExitHint(false);
      }, EXIT_WINDOW_MS);
    };

    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      clearTimeout(timer);
    };
  }, []);

  return exitHint;
}
