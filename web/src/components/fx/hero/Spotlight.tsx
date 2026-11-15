"use client";

import { motion, useMotionTemplate, useMotionValue, useSpring } from "motion/react";
import { useEffect, useRef } from "react";
import { cn } from "@/components/ui/cn";
import { useFinePointer } from "@/components/ui/hooks";
import { spring } from "@/lib/motion";
import { useEffectActive } from "../useEffectActive";

const REST_Y = 0;

/**
 * Soft accent light that follows the pointer across its parent (desktop, spring.smooth).
 * On touch, under reduced motion, or off-screen it rests at the top centre.
 * Place inside a `relative` container.
 */
export function Spotlight({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const fine = useFinePointer();
  const { active } = useEffectActive(ref);
  const follow = fine && active;

  const x = useMotionValue(50);
  const y = useMotionValue(REST_Y);
  const sx = useSpring(x, spring.smooth);
  const sy = useSpring(y, spring.smooth);
  const background = useMotionTemplate`radial-gradient(60rem 36rem at ${sx}% ${sy}%, color-mix(in oklch, var(--color-accent) 22%, transparent), transparent 65%)`;

  useEffect(() => {
    const host = ref.current?.parentElement;
    if (!host || !follow) {
      x.set(50);
      y.set(REST_Y);
      return;
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = host.getBoundingClientRect();
      x.set(((e.clientX - r.left) / r.width) * 100);
      y.set(((e.clientY - r.top) / r.height) * 100);
    };
    const onLeave = () => {
      x.set(50);
      y.set(REST_Y);
    };
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    return () => {
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, [follow, x, y]);

  return (
    <motion.div
      ref={ref}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0", className)}
      style={{ backgroundImage: background }}
    />
  );
}
