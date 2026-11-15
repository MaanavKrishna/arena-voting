"use client";

import { motion } from "motion/react";
import { useId, type ComponentProps, type ReactNode } from "react";
import { spring } from "@/lib/motion";
import { cn } from "./cn";

export type ToggleProps = Omit<ComponentProps<"input">, "type" | "onChange"> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
};

/** Native checkbox with role="switch" and a spring thumb. */
export function Toggle({ checked, onCheckedChange, label, description, disabled, className, id, ...rest }: ToggleProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <label
      htmlFor={inputId}
      className={cn(
        "group inline-flex min-h-11 cursor-pointer items-center justify-between gap-4",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <span className="flex min-w-0 flex-col">
        <span className="text-callout text-fg">{label}</span>
        {description ? <span className="text-footnote text-fg-muted">{description}</span> : null}
      </span>
      <span className="relative inline-flex shrink-0">
        <input
          id={inputId}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onCheckedChange(e.target.checked)}
          className="peer absolute inset-0 z-10 cursor-[inherit] appearance-none rounded-full"
          {...rest}
        />
        <span
          aria-hidden
          className={cn(
            "flex h-7 w-12 items-center rounded-full p-0.5 transition-colors duration-200",
            "peer-focus-visible:outline-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2",
            checked ? "bg-verified" : "bg-fg/15",
          )}
        >
          <motion.span
            className="bg-bg-elevated block size-6 rounded-full shadow-md"
            animate={{ x: checked ? 20 : 0 }}
            initial={false}
            transition={spring.snappy}
          />
        </span>
      </span>
    </label>
  );
}
