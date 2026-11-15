"use client";

import { RotateCcw } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { fade, spring, type SpringName } from "@/lib/motion";
import { Section } from "./Section";

const uses: Record<SpringName, string> = {
  snappy: "Press, toggles, chips",
  smooth: "Layout, cards, page elements",
  sheet: "Sheets after a drag release",
  flick: "Released with momentum",
  celebrate: "Winner, vote confirmed",
};

const DOT = 28;

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function SpringRow({ name, run }: { name: SpringName; run: number }) {
  const [ref, width] = useWidth();
  const [local, setLocal] = useState(0);
  const tick = run + local;
  const t = spring[name];
  const at = tick % 2 === 1 ? Math.max(0, width - DOT) : 0;
  return (
    <div className="border-border grid items-center gap-3 border-b py-4 last:border-0 md:grid-cols-[13rem_1fr_auto] md:gap-6">
      <div className="flex flex-col">
        <span className="text-callout text-fg">spring.{name}</span>
        <span className="text-caption text-fg-muted tabular">
          {t.visualDuration}s · bounce {t.bounce} · {uses[name]}
        </span>
      </div>
      <div ref={ref} className="bg-fg/5 relative h-7 rounded-full">
        <motion.span
          className="bg-accent shadow-sm absolute top-0 left-0 block size-7 rounded-full"
          initial={false}
          animate={{ x: at }}
          transition={t}
        />
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setLocal((n) => n + 1)}
        icon={<RotateCcw className="size-3.5" strokeWidth={1.75} aria-hidden />}
        aria-label={`Replay spring.${name}`}
      >
        Replay
      </Button>
    </div>
  );
}

export function MotionSection() {
  const [run, setRun] = useState(0);
  const [fadeOn, setFadeOn] = useState(true);
  return (
    <Section
      id="motion"
      index="05"
      title="Motion"
      description="Springs for anything a person touches. Critically damped by default; bounce only after momentum or for a celebration. Under reduced motion springs become a 200ms fade."
    >
      <div className="solid squircle rounded-lg px-5 py-2 md:px-6">
        <div className="flex items-center justify-between py-3">
          <p className="text-caption-caps text-fg-muted">Spring tokens · lib/motion.ts</p>
          <Button size="sm" variant="secondary" onClick={() => setRun((n) => n + 1)}>
            Replay all
          </Button>
        </div>
        {(Object.keys(spring) as SpringName[]).map((name) => (
          <SpringRow key={name} name={name} run={run} />
        ))}
        <div className="grid items-center gap-3 py-4 md:grid-cols-[13rem_1fr_auto] md:gap-6">
          <div className="flex flex-col">
            <span className="text-callout text-fg">fade</span>
            <span className="text-caption text-fg-muted tabular">0.2s · opacity only, reduced motion</span>
          </div>
          <div className="bg-fg/5 relative h-7 rounded-full">
            <motion.span
              className="bg-accent absolute inset-y-0 left-0 block w-full rounded-full"
              initial={false}
              animate={{ opacity: fadeOn ? 1 : 0.1 }}
              transition={fade}
            />
          </div>
          <Button size="sm" variant="ghost" onClick={() => setFadeOn((v) => !v)} aria-label="Replay fade">
            Replay
          </Button>
        </div>
      </div>
    </Section>
  );
}
