"use client";

import { motion } from "motion/react";
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { spring } from "@/lib/motion";
import { cn } from "./cn";

export type SegmentOption<T extends string> = {
  value: T;
  label: ReactNode;
  /** Required when `label` is icon-only. */
  ariaLabel?: string;
  disabled?: boolean;
};

export type SegmentedControlProps<T extends string> = {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  "aria-label": string;
  size?: "sm" | "md";
  className?: string;
  /** Fill the available width with equal segments. */
  stretch?: boolean;
};

/** Radio group with a sliding indicator. Arrow keys move the selection. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
  stretch,
  ...aria
}: SegmentedControlProps<T>) {
  const layoutId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.filter((o) => !o.disabled);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const idx = enabled.findIndex((o) => o.value === value);
    const next = enabled[(idx + dir + enabled.length) % enabled.length];
    if (!next) return;
    onChange(next.value);
    refs.current[options.indexOf(next)]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={aria["aria-label"]}
      onKeyDown={onKeyDown}
      className={cn(
        "bg-fg/6 inline-flex rounded-sm p-0.5",
        stretch && "flex w-full",
        className,
      )}
    >
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={o.ariaLabel}
            disabled={o.disabled}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative isolate inline-flex items-center justify-center gap-1.5 rounded-xs px-3 transition-colors duration-150",
              "disabled:opacity-40",
              size === "sm" ? "text-footnote h-7" : "text-callout h-9",
              stretch && "flex-1",
              selected ? "text-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            {selected ? (
              <motion.span
                layoutId={layoutId}
                transition={spring.snappy}
                aria-hidden
                className="bg-bg-elevated shadow-sm absolute inset-0 -z-10 rounded-xs"
              />
            ) : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
