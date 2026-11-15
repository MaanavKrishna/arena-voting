"use client";

import { Check } from "lucide-react";
import { motion } from "motion/react";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/cn";
import { STEPS } from "./draft";

/** Four labelled steps on desktop; "Step 2 of 4" with a progress bar on phones. Reached steps are tappable. */
export function StepIndicator({
  step,
  furthest,
  onGo,
}: {
  step: number;
  /** Highest step reached so far; steps up to it can be revisited. */
  furthest: number;
  onGo: (step: number) => void;
}) {
  return (
    <nav aria-label="Progress">
      {/* phone */}
      <div className="md:hidden">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-callout text-fg">{STEPS[step].label}</p>
          <p className="text-footnote text-fg-muted tabular">
            Step {step + 1} of {STEPS.length}
          </p>
        </div>
        <div className="flex gap-1.5" aria-hidden>
          {STEPS.map((s, i) => (
            <span key={s.id} className="bg-fg/10 relative h-1 flex-1 overflow-hidden rounded-full">
              <motion.span
                className="bg-accent absolute inset-0 origin-left rounded-full"
                initial={false}
                animate={{ scaleX: i <= step ? 1 : 0 }}
                transition={spring.smooth}
              />
            </span>
          ))}
        </div>
      </div>

      {/* desktop */}
      <ol className="hidden items-center gap-2 md:flex">
        {STEPS.map((s, i) => {
          const current = i === step;
          const done = i <= furthest && !current;
          return (
            <li key={s.id} className="flex flex-1 items-center gap-2 last:flex-none">
              <button
                type="button"
                disabled={!done}
                aria-current={current ? "step" : undefined}
                onClick={() => onGo(i)}
                className={cn(
                  "text-callout relative flex items-center gap-2.5 rounded-full py-1 pr-3 pl-1 transition-colors",
                  "after:absolute after:-inset-y-2 after:inset-x-0",
                  current ? "text-fg" : done ? "text-fg-muted hover:text-fg" : "text-fg-muted/70 cursor-default",
                )}
              >
                <span
                  className={cn(
                    "text-footnote tabular grid size-7 shrink-0 place-items-center rounded-full border transition-colors",
                    current
                      ? "border-accent bg-accent text-accent-fg"
                      : done
                        ? "border-verified/40 bg-verified/14 text-verified-text"
                        : "border-border-strong",
                  )}
                >
                  {done ? <Check className="size-4" strokeWidth={2} aria-hidden /> : i + 1}
                </span>
                {s.label}
              </button>
              {i < STEPS.length - 1 ? <span aria-hidden className="bg-border h-px flex-1" /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
