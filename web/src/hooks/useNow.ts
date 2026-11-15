"use client";

import { useSyncExternalStore } from "react";

type Clock = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => bigint;
  /** Number of live intervals — 0 or 1. Exposed for tests. */
  intervalCount: () => number;
};

const toSeconds = (ms: number) => BigInt(Math.floor(ms / 1000));

/**
 * A 1 s clock shared by every subscriber: one interval no matter how many components listen,
 * started with the first subscriber and stopped with the last.
 */
export function createClock(
  nowMs: () => number = () => Date.now(),
  timers: {
    set: (fn: () => void, ms: number) => unknown;
    clear: (id: unknown) => void;
  } = { set: (fn, ms) => setInterval(fn, ms), clear: (id) => clearInterval(id as ReturnType<typeof setInterval>) },
): Clock {
  const listeners = new Set<() => void>();
  let timer: unknown = null;
  let current = toSeconds(nowMs());

  const tick = () => {
    const next = toSeconds(nowMs());
    if (next !== current) {
      current = next;
      listeners.forEach((l) => l());
    }
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) {
        current = toSeconds(nowMs());
        timer = timers.set(tick, 1_000);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && timer !== null) {
          timers.clear(timer);
          timer = null;
        }
      };
    },
    getSnapshot: () => (listeners.size === 0 ? toSeconds(nowMs()) : current),
    intervalCount: () => (timer === null ? 0 : 1),
  };
}

const clock = createClock();

/** Server and hydration snapshot: unknown. Treat `0n` as "not mounted yet". */
export const NOW_UNKNOWN = 0n;

/** Current unix time in whole seconds from the device clock, ticking once per second. `0n` until mounted. */
export function useNow(): bigint {
  return useSyncExternalStore(clock.subscribe, clock.getSnapshot, () => NOW_UNKNOWN);
}
