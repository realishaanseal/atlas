import type { Variants } from 'motion/react';
import { springs, tween } from './springs';

/**
 * Shared enter/exit choreography for anything that mounts and unmounts inside
 * an <AnimatePresence>. Each set has `hidden` / `visible` / `exit`; exits are
 * always faster than entrances so dismissing never feels sluggish.
 *
 * `MotionConfig reducedMotion="user"` (config.tsx) strips the transforms from
 * all of these for anyone who asks the OS to reduce motion — they collapse to a
 * plain opacity fade, or to nothing.
 */

/** Pure crossfade. Backdrops, tooltips, text swaps. */
export const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: tween.base },
  exit: { opacity: 0, transition: tween.fast },
};

/** Backdrop behind a modal or sheet — ramps a touch slower than its panel so
 *  the panel reads as arriving ahead of the dim. */
export const backdrop: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: tween.slow },
  exit: { opacity: 0, transition: tween.base },
};

/** Rises a few px while fading in. Banners, inline notices, menu rows,
 *  list items that are not the message list. */
export const riseIn: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: springs.gentle },
  exit: { opacity: 0, y: 4, transition: tween.fast },
};

/** Expands out of its own surface. Modals, popovers, receipt panels. Pair with
 *  a transform-origin on the element so it grows from the right corner. */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.94, y: 6 },
  visible: { opacity: 1, scale: 1, y: 0, transition: springs.glass },
  exit: { opacity: 0, scale: 0.97, transition: tween.fast },
};

/** Tighter, quicker scaleIn for small anchored popovers and dropdown menus. */
export const popover: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: -4 },
  visible: { opacity: 1, scale: 1, y: 0, transition: springs.snappy },
  exit: { opacity: 0, scale: 0.97, y: -2, transition: tween.fast },
};

/** Bottom sheet: slides up from off-screen. The drag-to-dismiss handling in
 *  Sheet.tsx takes over from here once the panel is resting. */
export const sheetUp: Variants = {
  hidden: { y: '100%' },
  visible: { y: 0, transition: springs.glass },
  exit: { y: '100%', transition: tween.slow },
};

/** Fullscreen overlay (image viewer, call screen): a shallow zoom + blur-in. */
export const veil: Variants = {
  hidden: { opacity: 0, scale: 1.04 },
  visible: { opacity: 1, scale: 1, transition: springs.glass },
  exit: { opacity: 0, scale: 1.02, transition: tween.base },
};
