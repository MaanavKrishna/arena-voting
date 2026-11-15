"use client";

import { useCallback, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

function read(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/** A remembered yes/no for this browser (used for "did the organiser copy the link yet"). */
export function useSharedFlag(key: string): [boolean, () => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => false,
  );
  const mark = useCallback(() => {
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // private mode: the tick just won't stick
    }
    listeners.forEach((l) => l());
  }, [key]);
  return [value, mark];
}
