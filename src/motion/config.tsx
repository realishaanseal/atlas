import { LazyMotion, MotionConfig, domMax } from 'motion/react';
import type { ReactNode } from 'react';
import { springs } from './springs';

/** Dev-only: `?reduce` forces the reduced-motion path so it can be checked
 *  without touching the OS setting. Statically dropped from production. */
const FORCE_REDUCED =
  import.meta.env.DEV &&
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('reduce');

/**
 * Wraps everything behind the lock screen in motion's context.
 *
 * `LazyMotion` + the `m` component (instead of `motion`) is what keeps the
 * animation runtime small: `strict` makes the bundler — and code review —
 * catch any stray `motion.*` import, which would silently pull the full
 * feature set back in. `domMax` is the complete DOM feature set (layout
 * animation, drag, the lot); it is loaded here rather than deferred because
 * this module already lives in the lazy ChatRoot chunk, so it is never
 * fetched until someone unlocks.
 *
 * `reducedMotion="user"` is not optional. It reads the OS setting and, for
 * anyone who has asked for less motion, drops every transform and layout
 * animation to a plain opacity change — matching the global CSS rule in
 * styles/index.css. `gentle` is the default transition so a bare animated
 * element already moves like the rest of the app.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig
        reducedMotion={FORCE_REDUCED ? 'always' : 'user'}
        transition={springs.gentle}
      >
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
