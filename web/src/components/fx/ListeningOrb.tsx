"use client";

import { Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef } from "react";
import { cn } from "@/components/ui/cn";
import { fade, spring } from "@/lib/motion";
import { useEffectActive } from "./useEffectActive";

export type OrbState = "idle" | "listening" | "verified";

export type ListeningOrbProps = {
  state: OrbState;
  /** Increment to play one ripple (a token was received). */
  pulseKey?: number;
  className?: string;
};

/**
 * Small presence orb: breathes while listening, ripples when a token arrives,
 * turns verified green with a check. Static under reduced motion / off-screen.
 */
export function ListeningOrb({ state, pulseKey = 0, className }: ListeningOrbProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const { active, reduced } = useEffectActive(ref);
  const listening = state === "listening";
  const colour = state === "verified" ? "bg-verified" : state === "listening" ? "bg-accent" : "bg-fg-subtle";

  return (
    <span ref={ref} aria-hidden className={cn("relative inline-grid size-5 place-items-center", className)}>
      {/* breathing halo */}
      <motion.span
        className={cn("absolute inset-0 rounded-full opacity-30", colour)}
        animate={listening && active ? { scale: [1, 1.35, 1], opacity: [0.3, 0.12, 0.3] } : { scale: 1, opacity: listening ? 0.25 : 0 }}
        transition={listening && active ? { duration: 2.4, ease: "easeInOut", repeat: Infinity } : fade}
      />
      {/* ripple on token received */}
      <AnimatePresence>
        {pulseKey > 0 && !reduced ? (
          <motion.span
            key={pulseKey}
            className={cn("absolute inset-0 rounded-full border-2", state === "verified" ? "border-verified" : "border-accent")}
            initial={{ scale: 0.6, opacity: 0.8 }}
            animate={{ scale: 2.2, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
          />
        ) : null}
      </AnimatePresence>
      {/* core */}
      <motion.span
        className={cn("relative grid size-3 place-items-center rounded-full transition-colors duration-300", colour)}
        animate={{ scale: state === "verified" ? 1.35 : 1 }}
        transition={reduced ? fade : spring.celebrate}
      >
        <AnimatePresence>
          {state === "verified" ? (
            <motion.span
              key="check"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={reduced ? fade : spring.snappy}
              className="text-accent-fg grid place-items-center"
            >
              <Check className="size-2.5" strokeWidth={3.5} />
            </motion.span>
          ) : null}
        </AnimatePresence>
      </motion.span>
    </span>
  );
}
