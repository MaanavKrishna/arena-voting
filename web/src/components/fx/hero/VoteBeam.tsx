"use client";

import { motion } from "motion/react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useIsClient, useReducedMotionPref } from "@/components/ui/hooks";

export type Point = { x: number; y: number };

/** Total flight time (design-system §7: 600 ms, then the seat pops). */
export const BEAM_MS = 600;

/** A curve that arcs up between two viewport points (control point above the midpoint). */
export function beamPath(from: Point, to: Point): string {
  const mx = (from.x + to.x) / 2;
  const lift = Math.min(160, Math.max(48, Math.hypot(to.x - from.x, to.y - from.y) * 0.35));
  const cy = Math.min(from.y, to.y) - lift;
  return `M ${from.x} ${from.y} Q ${mx} ${cy} ${to.x} ${to.y}`;
}

export type VoteBeamProps = {
  from: Point;
  to: Point;
  /** Entry colour, e.g. `var(--color-entry-2)`. */
  color: string;
  /** Called once the beam has landed (immediately under reduced motion: seats appear without it). */
  onDone: () => void;
};

/**
 * Transient celebration: a glowing line from the card you voted for to your new seat in the
 * Hemicycle. Draws in, then fades as the seat pops (`spring.celebrate` on the seat). Fixed overlay,
 * never takes pointer events. Mount it only for the flight.
 */
export function VoteBeam({ from, to, color, onDone }: VoteBeamProps) {
  const mounted = useIsClient();
  const reduce = useReducedMotionPref();
  const glowId = useId();
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  useEffect(() => {
    const t = setTimeout(() => doneRef.current(), reduce ? 0 : BEAM_MS);
    return () => clearTimeout(t);
  }, [reduce]);

  if (!mounted || reduce) return null;
  const d = beamPath(from, to);
  const draw = { duration: BEAM_MS / 1000 * 0.75, ease: [0.23, 1, 0.32, 1] as const };

  return createPortal(
    <svg
      aria-hidden
      data-testid="vote-beam"
      className="pointer-events-none fixed inset-0 z-50 size-full overflow-visible"
    >
      <defs>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <motion.g
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ delay: (BEAM_MS / 1000) * 0.7, duration: (BEAM_MS / 1000) * 0.3 }}
      >
        <motion.path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
          filter={`url(#${glowId})`}
          initial={{ pathLength: 0, opacity: 0.9 }}
          animate={{ pathLength: 1 }}
          transition={draw}
        />
        <motion.path
          d={d}
          fill="none"
          stroke="oklch(0.98 0.02 280)"
          strokeWidth={2}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={draw}
        />
        <motion.circle
          cx={to.x}
          cy={to.y}
          r={14}
          fill={color}
          filter={`url(#${glowId})`}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 0.9 }}
          transition={{ delay: (BEAM_MS / 1000) * 0.55, duration: 0.15 }}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
      </motion.g>
    </svg>,
    document.body,
  );
}
