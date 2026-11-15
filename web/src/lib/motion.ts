/** Motion tokens — docs/design-system.md §6. Import springs from here, never inline them. */
export const spring = {
  snappy: { type: "spring", visualDuration: 0.25, bounce: 0 }, // press, toggles, chips
  smooth: { type: "spring", visualDuration: 0.4, bounce: 0 }, // layout, cards, page elements (default)
  sheet: { type: "spring", visualDuration: 0.35, bounce: 0.15 }, // sheets/drawers after a drag release
  flick: { type: "spring", visualDuration: 0.4, bounce: 0.2 }, // released with momentum only
  celebrate: { type: "spring", visualDuration: 0.6, bounce: 0.35 }, // winner, vote confirmed seat pop
} as const;
export const fade = { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] } as const; // opacity-only and reduced-motion
export const stagger = 0.04; // list reveals, max 8 items staggered, rest appear together

export type SpringName = keyof typeof spring;

/** Delay for item `i` in a staggered reveal: the first 8 stagger, the rest arrive with the 8th. */
export function staggerDelay(i: number): number {
  return Math.min(i, 7) * stagger;
}

/**
 * Where a released drag would come to rest (deceleration projection).
 * `velocity` in px/s: current + (v / 1000) * d / (1 - d), d = 0.998.
 */
export function projectRelease(current: number, velocity: number, decelerationRate = 0.998): number {
  return current + ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}
