"use client";

import { useInView } from "motion/react";
import type { RefObject } from "react";
import { useDocumentVisible, useReducedMotionPref } from "@/components/ui/hooks";

/**
 * Effects run only while on screen and while the tab is visible (§7 performance budget).
 * `reduced` follows <MotionConfig reducedMotion> (global "user", or a forced preview on /system).
 */
export function useEffectActive(ref: RefObject<Element | null>, margin = "120px") {
  const inView = useInView(ref, { margin: margin as `${number}px` });
  const visible = useDocumentVisible();
  const reduced = useReducedMotionPref();
  return { active: inView && visible && !reduced, reduced, inView, visible };
}
