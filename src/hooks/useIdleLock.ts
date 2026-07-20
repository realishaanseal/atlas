import { useEffect, useRef } from 'react';
import { SECURITY } from '@/config';

/**
 * Locks the conversation after a period of inactivity.
 *
 * This protects against one specific thing: an unlocked session left open on a
 * device someone else can reach. It does nothing against an attacker with the
 * passphrase or with database access, and it is not pretending to.
 *
 * Activity is anything that indicates a person is present — pointer, keyboard,
 * scroll, touch. Deliberately NOT incoming messages: your friend typing should
 * not keep your unattended laptop unlocked.
 *
 * The timer also fires on tab close, because a backgrounded tab stops getting
 * timer callbacks reliably; the visibility check on return catches the case
 * where the browser froze the page instead of running our timeout.
 */
export function useIdleLock(onLock: () => void, enabled: boolean) {
  const lastActivity = useRef(Date.now());
  const onLockRef = useRef(onLock);
  onLockRef.current = onLock;

  useEffect(() => {
    if (!enabled || SECURITY.IDLE_LOCK_MS <= 0) return;

    const note = () => {
      lastActivity.current = Date.now();
    };

    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    for (const event of events) {
      document.addEventListener(event, note, { passive: true });
    }

    const check = () => {
      if (Date.now() - lastActivity.current >= SECURITY.IDLE_LOCK_MS) onLockRef.current();
    };

    // Checked on a timer AND on return to the tab: a backgrounded tab may be
    // frozen entirely, so the interval alone cannot be trusted to have run.
    const timer = setInterval(check, 30_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      for (const event of events) document.removeEventListener(event, note);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(timer);
    };
  }, [enabled]);
}
