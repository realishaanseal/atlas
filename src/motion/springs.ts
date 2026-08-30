import type { Transition } from 'motion/react';

/**
 * The motion vocabulary.
 *
 * Springs, not durations — the redesign's feel comes from things having weight
 * and a little follow-through rather than easing along a fixed clock. Four
 * named presets cover everything:
 *
 *   snappy    — taps, toggles, hovers. Quick, barely any overshoot.
 *   gentle    — content settling: list items, panels sliding, layout shifts.
 *   glass     — heavy surfaces: sheets, modals, the things with mass.
 *   overshoot — "it landed": a reaction popping in, a badge appearing.
 *
 * Every animated component pulls its transition from here so the whole app
 * moves as one material. `MotionConfig` in config.tsx sets `gentle` as the
 * default, so a bare `<m.div animate=…>` already feels right.
 */
export const springs = {
  snappy: { type: 'spring', stiffness: 420, damping: 34, mass: 0.9 },
  gentle: { type: 'spring', stiffness: 260, damping: 30 },
  glass: { type: 'spring', stiffness: 210, damping: 26, mass: 1.1 },
  overshoot: { type: 'spring', stiffness: 500, damping: 20, mass: 0.8 },
} satisfies Record<string, Transition>;

/**
 * Tween timings, for the few things a spring does not suit — opacity-only
 * crossfades, colour, backdrop blur ramps. Seconds, matching motion's unit.
 */
export const tween = {
  fast: { duration: 0.16, ease: [0.22, 1, 0.36, 1] },
  base: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
  slow: { duration: 0.36, ease: [0.22, 1, 0.36, 1] },
} satisfies Record<string, Transition>;
