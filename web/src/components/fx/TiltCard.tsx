"use client";

import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from "motion/react";
import { useRef, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { useFinePointer } from "@/components/ui/hooks";
import { spring } from "@/lib/motion";
import { useEffectActive } from "./useEffectActive";

const MAX_TILT = 8; // degrees (§7)

/**
 * 3D tilt toward the pointer with a specular highlight. Desktop pointer only;
 * flat on touch, under reduced motion and off-screen.
 */
export function TiltCard({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const fine = useFinePointer();
  const { active } = useEffectActive(ref);
  const enabled = fine && active;

  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const sx = useSpring(px, spring.smooth);
  const sy = useSpring(py, spring.smooth);
  const rotateY = useTransform(sx, [0, 1], [-MAX_TILT, MAX_TILT]);
  const rotateX = useTransform(sy, [0, 1], [MAX_TILT, -MAX_TILT]);
  const hx = useTransform(sx, (v) => `${v * 100}%`);
  const hy = useTransform(sy, (v) => `${v * 100}%`);
  const highlight = useMotionTemplate`radial-gradient(circle at ${hx} ${hy}, oklch(1 0 0 / 0.22), transparent 55%)`;
  const glare = useMotionValue(0);
  const glareOpacity = useSpring(glare, spring.smooth);

  const reset = () => {
    px.set(0.5);
    py.set(0.5);
    glare.set(0);
  };

  return (
    <div className={cn("perspective-tilt", className)}>
      <motion.div
        ref={ref}
        onPointerMove={(e) => {
          if (!enabled || e.pointerType !== "mouse") return;
          const r = e.currentTarget.getBoundingClientRect();
          px.set((e.clientX - r.left) / r.width);
          py.set((e.clientY - r.top) / r.height);
          glare.set(1);
        }}
        onPointerLeave={reset}
        style={enabled ? { rotateX, rotateY, transformStyle: "preserve-3d" } : undefined}
        className="relative h-full rounded-[inherit]"
      >
        {children}
        {enabled ? (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[inherit] mix-blend-soft-light"
            style={{ backgroundImage: highlight, opacity: glareOpacity }}
          />
        ) : null}
      </motion.div>
    </div>
  );
}
