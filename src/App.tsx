import { Suspense, lazy, useEffect, useState } from 'react';
import LockScreen from '@/pages/LockScreen';
import UnpairedScreen from '@/pages/UnpairedScreen';
import { useSession } from '@/hooks/useSession';
import { cn } from '@/utils/cn';

/**
 * The conversation, the theme engine, the emoji pack and the animation runtime
 * all live behind this lazy import. The lock screen paints without any of them,
 * and none of it is fetched until a passphrase has been accepted.
 */
const ChatRoot = lazy(() => import('@/pages/ChatRoot'));

/** Must match the `veil-out` animation duration in styles/index.css. */
const UNLOCK_EXIT_MS = 620;

export default function App() {
  const { status, slot, uid, reason, submit, lock, keyRef } = useSession();

  const key = keyRef.current;
  const unlocked = status === 'unlocked' && key !== null && slot !== null && uid !== null;

  /**
   * The lock screen outlives the unlock by one animation.
   *
   * Swapping the two instantly is what makes an unlock feel abrupt: the
   * passphrase is correct, a second of key derivation passes, and then the
   * whole screen simply replaces itself. Instead the lock stays mounted on top
   * for `UNLOCK_EXIT_MS`, pushing outward and blurring away while the
   * conversation resolves underneath it.
   */
  const [lockMounted, setLockMounted] = useState(true);
  const [lockExiting, setLockExiting] = useState(false);

  useEffect(() => {
    if (!unlocked) {
      // Locked again (idle timeout, or an explicit lock): restore the lock
      // screen for next time.
      setLockMounted(true);
      setLockExiting(false);
      return;
    }

    if (!lockMounted) return;

    setLockExiting(true);

    // Drop focus out of the departing screen. Two reasons: focus must not sit
    // inside an aria-hidden subtree, and on a phone it dismisses the keyboard
    // so the conversation is not revealed behind it.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

    // Anyone who asked the OS to stop animations gets the swap immediately —
    // the global reduced-motion rule cancels the animation, and waiting out its
    // nominal duration would just look like a frozen screen.
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const timer = setTimeout(
      () => {
        setLockMounted(false);
      },
      reduced ? 0 : UNLOCK_EXIT_MS,
    );

    return () => {
      clearTimeout(timer);
    };
  }, [unlocked, lockMounted]);

  if (status === 'unpaired') return <UnpairedScreen />;

  return (
    <>
      {unlocked && (
        <div className="animate-app-in h-full">
          <Suspense fallback={<div className="h-full" />}>
            <ChatRoot cryptoKey={key} slot={slot} uid={uid} onLock={lock} />
          </Suspense>
        </div>
      )}

      {lockMounted && (
        <div
          className={cn(
            'h-full',
            // Only pinned above the conversation while it is on its way out;
            // in the ordinary locked state it is simply the page.
            lockExiting && 'animate-veil-out pointer-events-none fixed inset-0 z-50',
          )}
          // Hidden from assistive tech the moment it starts leaving, so focus
          // and the reading order move to the conversation immediately.
          aria-hidden={lockExiting || undefined}
        >
          <LockScreen status={status} reason={reason} onSubmit={submit} />
        </div>
      )}
    </>
  );
}
