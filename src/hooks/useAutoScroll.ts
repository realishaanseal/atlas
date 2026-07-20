import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Sticky-bottom scrolling.
 *
 * Auto-scroll is only correct when the user is already at the bottom. If they
 * have scrolled up to read something, yanking them back down when a message
 * arrives is hostile. So we track intent: within 80px of the bottom counts as
 * "following", and only then do new messages scroll.
 */
export function useAutoScroll<T extends HTMLElement>(dependency: unknown) {
  const ref = useRef<T | null>(null);
  const [following, setFollowing] = useState(true);

  const onScroll = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    setFollowing(distance < 80);
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element || !following) return;
    element.scrollTop = element.scrollHeight;
  }, [dependency, following]);

  const scrollToBottom = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
    setFollowing(true);
  }, []);

  return { ref, following, onScroll, scrollToBottom };
}
