"use client";

import { AnimatePresence, motion } from "motion/react";
import { fade } from "@/lib/motion";
import { cn } from "./cn";

const pad = (n: number) => String(n).padStart(2, "0");

export function formatRemaining(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

function spoken(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [d && `${d} days`, h && `${h} hours`, m && `${m} minutes`].filter(Boolean);
  return parts.length ? parts.join(" ") : "less than a minute";
}

export type CountdownProps = {
  /** Target time, unix seconds. */
  to: number;
  /** Current time, unix seconds. Comes from `useNow` / chain time (a mock clock on /system). */
  now: number;
  /** Shown before the time, e.g. "Voting closes in". */
  label?: string;
  endedLabel?: string;
  className?: string;
};

/** Tabular countdown that cross-fades to "Ended". */
export function Countdown({ to, now, label, endedLabel = "Ended", className }: CountdownProps) {
  const remaining = to - now;
  const ended = remaining <= 0;
  return (
    <span
      role="timer"
      aria-label={ended ? endedLabel : `${label ? `${label} ` : ""}${spoken(remaining)}`}
      className={cn("inline-grid", className)}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={ended ? "ended" : "running"}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={fade}
          aria-hidden
          className="col-start-1 row-start-1 inline-flex items-baseline gap-1.5 whitespace-nowrap"
        >
          {ended ? (
            <span className="text-fg-muted">{endedLabel}</span>
          ) : (
            <>
              {label ? <span className="text-fg-muted">{label}</span> : null}
              <span className="tabular text-fg">{formatRemaining(remaining)}</span>
            </>
          )}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
