"use client";

import { MotionConfigContext } from "motion/react";
import { useCallback, useContext, useSyncExternalStore } from "react";

/** Media query as state. Server snapshot is `false`, so first paint assumes the narrow/plain case. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/** `true` while the tab is visible. */
export function useDocumentVisible(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => !document.hidden,
    () => true,
  );
}

const noopSubscribe = () => () => {};

/** `true` after hydration; `false` during SSR and the hydration pass. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/** Desktop-class pointer (mouse/trackpad). Effects that follow the pointer are off otherwise. */
export function useFinePointer(): boolean {
  return useMediaQuery("(hover: hover) and (pointer: fine)");
}

/** ≥ 768px — Sheet becomes a centred dialog, Toasts move top-right. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 48rem)");
}

/**
 * Reduced motion as motion's <MotionConfig> sees it ("always" on the /system preview, the OS
 * setting under "user"), but hydration-safe: the server and first client pass assume full motion.
 */
export function useReducedMotionPref(): boolean {
  const { reducedMotion } = useContext(MotionConfigContext);
  const os = useMediaQuery("(prefers-reduced-motion: reduce)");
  if (reducedMotion === "always") return true;
  if (reducedMotion === "never") return false;
  return os;
}
