"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui/cn";
import { useEffectActive } from "../useEffectActive";

/**
 * A light travelling around the border of its parent (6s per lap). A rotating conic
 * gradient is masked to a 1px ring, so only `transform` animates. Paused off-screen and when
 * the tab is hidden; under reduced motion it becomes a static accent hairline.
 * Place inside a `relative` container with a border radius.
 */
export function BorderBeam({ className, width = 1.5 }: { className?: string; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const { active, reduced } = useEffectActive(ref, "0px");
  const [size, setSize] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width: w, height: h } = entry.contentRect;
      setSize(Math.ceil(Math.hypot(w, h)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]", className)}
      style={{
        padding: `${width}px`,
        mask: "linear-gradient(black, black) content-box exclude, linear-gradient(black, black)",
        WebkitMask: "linear-gradient(black, black) content-box, linear-gradient(black, black)",
        WebkitMaskComposite: "xor",
      }}
    >
      {reduced ? (
        <div className="bg-accent/50 absolute inset-0" />
      ) : (
        <div
          className="animate-beam absolute top-1/2 left-1/2"
          style={{
            width: size,
            height: size,
            transform: "translate(-50%, -50%)",
            animationPlayState: active ? "running" : "paused",
            backgroundImage:
              "conic-gradient(from 0deg, transparent 0turn, transparent 0.72turn, color-mix(in oklch, var(--color-accent) 70%, transparent) 0.86turn, oklch(0.97 0.03 280) 0.92turn, var(--color-live) 0.96turn, transparent 1turn)",
          }}
        />
      )}
    </div>
  );
}
