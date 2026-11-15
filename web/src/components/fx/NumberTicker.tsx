"use client";

import { motion, useSpring, useTransform } from "motion/react";
import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/components/ui/cn";
import { spring } from "@/lib/motion";
import { useEffectActive } from "./useEffectActive";

export type NumberTickerProps = {
  value: number;
  decimals?: number;
  className?: string;
  /** Text after the number for screen readers and display, e.g. " votes". */
  suffix?: string;
};

/**
 * Spring-driven counter. Tabular digits so nothing jitters; jumps straight to the value
 * under reduced motion, off-screen, or when the tab is hidden.
 */
export function NumberTicker({ value, decimals = 0, className, suffix }: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const { active } = useEffectActive(ref);
  const mv = useSpring(value, { visualDuration: spring.smooth.visualDuration + 0.2, bounce: 0 });
  // Fixed locale so server and client render the same digits.
  const fmt = useMemo(
    () => new Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
    [decimals],
  );
  const text = useTransform(mv, (v) => fmt.format(v));

  useEffect(() => {
    if (active) mv.set(value);
    else mv.jump(value);
  }, [value, active, mv]);

  return (
    <span ref={ref} className={cn("tabular inline-block", className)}>
      <motion.span aria-hidden>{text}</motion.span>
      {suffix ? <span aria-hidden>{suffix}</span> : null}
      <span className="sr-only">
        {fmt.format(value)}
        {suffix}
      </span>
    </span>
  );
}
