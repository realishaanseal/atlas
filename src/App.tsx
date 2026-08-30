import { Suspense, lazy, useEffect, useState } from 'react';
import CoverSite from '@/cover/CoverSite';
import { useSession } from '@/hooks/useSession';
import { cn } from '@/utils/cn';

/**
 * Two applications share one origin.
 *
 * The one everybody gets is a revision-notes site. The other is reached only by
 * entering the right thing into the access-code field in its footer, and until
 * that happens its code is never even fetched — `ChatRoot` is a lazy import, so
 * the conversation, the crypto layer and the config all live in chunks the
 * browser has no reason to request.
 *
 * That split is the actual security property here, and it is worth being honest
 * about its limits. This is concealment, not cryptography: someone who reads
 * the JavaScript carefully will work out that there is a second application
 * behind the code box. What it defends against is the realistic threat — a
 * person who picks up the phone, opens the browser, and sees a notes site.
 */
const ChatRoot = lazy(() => import('@/pages/ChatRoot'));

/** Must match the `veil-out` animation duration in styles/index.css. */
const UNLOCK_EXIT_MS = 520;

export default function App() {
  const { status, slot, uid, reason, submit, detect, lock, keyRef } = useSession();

  const key = keyRef.current;
  const unlocked = status === 'unlocked' && key !== null && slot !== null && uid !== null;

  /**
   * The cover outlives the unlock by one animation.
   *
   * Swapping the two instantly is what makes an unlock feel abrupt: the code is
   * accepted, a second of key derivation passes, and then the whole page simply
   * replaces itself. Instead the site stays mounted on top for
   * `UNLOCK_EXIT_MS`, pushing outward and blurring away while the conversation
   * resolves underneath it.
   */
  const [coverMounted, setCoverMounted] = useState(true);
  const [coverExiting, setCoverExiting] = useState(false);

  useEffect(() => {
    if (!unlocked) {
      // Locked again (idle timeout, or an explicit lock): the site comes back,
      // at whatever page the address bar still says. Nothing announces that
      // anything happened.
      setCoverMounted(true);
      setCoverExiting(false);
      return;
    }

    if (!coverMounted) return;

    setCoverExiting(true);

    // Drop focus out of the departing page. Two reasons: focus must not sit
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
        setCoverMounted(false);
      },
      reduced ? 0 : UNLOCK_EXIT_MS,
    );

    return () => {
      clearTimeout(timer);
    };
  }, [unlocked, coverMounted]);

  return (
    <>
      {unlocked && (
        <div className="animate-app-in h-full">
          <Suspense fallback={<div className="h-full" />}>
            <ChatRoot cryptoKey={key} slot={slot} uid={uid} onLock={lock} />
          </Suspense>
        </div>
      )}

      {coverMounted && (
        <div
          className={cn(
            // Only pinned above the conversation while it is on its way out;
            // in the ordinary state it is simply the page, and must scroll.
            coverExiting && 'animate-veil-out pointer-events-none fixed inset-0 z-50 overflow-hidden',
          )}
          // Hidden from assistive tech the moment it starts leaving, so focus
          // and the reading order move to the conversation immediately.
          aria-hidden={coverExiting || undefined}
        >
          <CoverSite
            status={status}
            reason={reason}
            onSubmit={submit}
            onDetect={detect}
            exiting={coverExiting}
          />
        </div>
      )}
    </>
  );
}
