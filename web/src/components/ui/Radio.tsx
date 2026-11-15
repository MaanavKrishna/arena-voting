"use client";

import { motion } from "motion/react";
import { useId, type ReactNode } from "react";
import { spring } from "@/lib/motion";
import { cn } from "./cn";

export type RadioOption<T extends string> = { value: T; label: ReactNode; description?: ReactNode; disabled?: boolean };

export type RadioGroupProps<T extends string> = {
  name?: string;
  legend: ReactNode;
  options: readonly RadioOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
};

/** Native radio inputs in a fieldset; arrow keys come free from the browser. */
export function RadioGroup<T extends string>({ name, legend, options, value, onChange, className }: RadioGroupProps<T>) {
  const autoName = useId();
  const groupName = name ?? autoName;
  return (
    <fieldset className={cn("flex flex-col", className)}>
      <legend className="text-footnote text-fg mb-1">{legend}</legend>
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <label
            key={o.value}
            className={cn(
              "inline-flex min-h-11 cursor-pointer items-start gap-3 py-2.5",
              o.disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <span className="relative mt-0.5 inline-grid size-5 shrink-0 place-items-center">
              <input
                type="radio"
                name={groupName}
                value={o.value}
                checked={checked}
                disabled={o.disabled}
                onChange={() => onChange(o.value)}
                className="peer border-border-strong bg-bg-elevated checked:border-accent absolute inset-0 cursor-[inherit] appearance-none rounded-full border transition-colors"
              />
              <motion.span
                aria-hidden
                initial={false}
                animate={{ scale: checked ? 1 : 0 }}
                transition={spring.snappy}
                className="bg-accent pointer-events-none relative size-2.5 rounded-full"
              />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-callout text-fg">{o.label}</span>
              {o.description ? <span className="text-footnote text-fg-muted">{o.description}</span> : null}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
