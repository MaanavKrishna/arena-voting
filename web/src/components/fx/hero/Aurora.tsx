"use client";

import { useRef } from "react";
import { cn } from "@/components/ui/cn";
import { useEffectActive } from "../useEffectActive";

/**
 * Ambient hero background: three soft OKLCH blobs (accent, live, entry-5) drifting on
 * 23s / 31s / 37s cycles at ≤ 0.35 opacity. Transform-only CSS animation, paused off-screen,
 * when the tab is hidden, and frozen under reduced motion.
 */
export function Aurora({ className, intensity = 0.32 }: { className?: string; intensity?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const { active, reduced } = useEffectActive(ref, "0px");
  const opacity = Math.min(intensity, 0.35);
  const playState = active ? "running" : "paused";
  const blob = "absolute rounded-full will-change-transform";

  return (
    <div ref={ref} aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div
        className={cn(blob, !reduced && "animate-aurora-a", "-top-1/4 -left-1/6 h-[70%] w-[65%]")}
        style={{
          opacity,
          animationPlayState: playState,
          backgroundImage: "radial-gradient(closest-side, var(--color-accent), transparent)",
        }}
      />
      <div
        className={cn(blob, !reduced && "animate-aurora-b", "top-0 -right-1/6 h-[60%] w-[55%]")}
        style={{
          opacity: opacity * 0.8,
          animationPlayState: playState,
          backgroundImage: "radial-gradient(closest-side, var(--color-live), transparent)",
        }}
      />
      <div
        className={cn(blob, !reduced && "animate-aurora-c", "-bottom-1/3 left-1/4 h-[65%] w-[60%]")}
        style={{
          opacity: opacity * 0.9,
          animationPlayState: playState,
          backgroundImage: "radial-gradient(closest-side, var(--color-entry-5), transparent)",
        }}
      />
    </div>
  );
}
