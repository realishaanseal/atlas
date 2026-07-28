import { Suspense, lazy, useEffect, useState } from 'react';
import LockScreen from '@/pages/LockScreen';
import UnpairedScreen from '@/pages/UnpairedScreen';
import { useSession } from '@/hooks/useSession';
import { CustomEmojiProvider } from '@/hooks/useCustomEmoji';
import { cn } from '@/utils/cn';

const Conversation = lazy(() => import('@/pages/Conversation'));

/** Must match the `lock-out` animation duration in styles/index.css. */
const UNLOCK_EXIT_MS = 520;

export default function App() {
  const { status, slot, uid, message, submit, lock, keyRef } = useSession();

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
      // Locked again (or never unlocked): restore the lock screen for next time.
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
        // Mounted inside the unlocked branch on purpose: the provider decrypts
        // the emoji pack and holds object URLs for it, so it should not exist —
        // and its blobs should not survive — outside an unlocked session.
        <div className="animate-app-in h-full">
          <Suspense fallback={<div className="h-full" />}>
            <CustomEmojiProvider cryptoKey={key}>
              <Conversation cryptoKey={key} slot={slot} uid={uid} onLock={lock} />
            </CustomEmojiProvider>
          </Suspense>
        </div>
      )}

      {lockMounted && (
        <div
          className={cn(
            'h-full',
            // Only pinned above the conversation while it is on its way out;
            // in the ordinary locked state it is simply the page.
            lockExiting && 'animate-lock-out pointer-events-none fixed inset-0 z-50',
          )}
          // Hidden from assistive tech the moment it starts leaving, so focus
          // and the reading order move to the conversation immediately.
          aria-hidden={lockExiting || undefined}
        >
          <LockScreen status={status} message={message} onSubmit={submit} />
        </div>
      )}
    </>
  );
}
