import type { Transition } from 'motion/react';

/**
 * The motion vocabulary.
 *
 * Springs, not durations — the redesign's feel comes from things having weight
 * and a real follow-through rather than easing along a fixed clock. Five named
 * presets cover everything:
 *
 *   snappy    — taps, toggles, hovers. Quick, a little overshoot.
 *   gentle    — content settling: list items, panels sliding, layout shifts.
 *   glass     — heavy surfaces: sheets, modals, the things with visible mass.
 *   overshoot — "it landed": a reaction popping in, a badge appearing.
 *   bouncy    — the showy one: the unlock reveal, an empty-state illustration.
 *
 * Every animated component pulls its transition from here so the whole app
 * moves as one material. `MotionConfig` in config.tsx sets `gentle` as the
 * default.
 */
export const springs = {
  snappy: { type: 'spring', stiffness: 380, damping: 30, mass: 0.9 },
  gentle: { type: 'spring', stiffness: 200, damping: 26, mass: 1 },
  glass: { type: 'spring', stiffness: 170, damping: 24, mass: 1.25 },
  overshoot: { type: 'spring', stiffness: 460, damping: 17, mass: 0.9 },
  bouncy: { type: 'spring', stiffness: 320, damping: 15, mass: 1 },
} satisfies Record<string, Transition>;

/**
 * Tween timings, for the few things a spring does not suit — opacity-only
 * crossfades, colour, backdrop blur ramps. Seconds, matching motion's unit.
 */
export const tween = {
  fast: { duration: 0.16, ease: [0.22, 1, 0.36, 1] },
  base: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
  slow: { duration: 0.44, ease: [0.22, 1, 0.36, 1] },
} satisfies Record<string, Transition>;
