"use client";

import { Check } from "lucide-react";
import { motion } from "motion/react";
import { useId, type ComponentProps, type ReactNode } from "react";
import { spring } from "@/lib/motion";
import { cn } from "./cn";

export type CheckboxProps = Omit<ComponentProps<"input">, "type" | "onChange"> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
};

export function Checkbox({ checked, onCheckedChange, label, description, disabled, className, id, ...rest }: CheckboxProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <label
      htmlFor={inputId}
      className={cn(
        "inline-flex min-h-11 cursor-pointer items-start gap-3 py-2.5",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <span className="relative mt-0.5 inline-grid size-5 shrink-0 place-items-center">
        <input
          id={inputId}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onCheckedChange(e.target.checked)}
          className={cn(
            "peer border-border-strong bg-bg-elevated absolute inset-0 cursor-[inherit] appearance-none rounded-xs border transition-colors",
            "checked:border-accent checked:bg-accent aria-invalid:border-danger",
          )}
          {...rest}
        />
        <motion.span
          aria-hidden
          initial={false}
          animate={{ scale: checked ? 1 : 0.4, opacity: checked ? 1 : 0 }}
          transition={spring.snappy}
          className="text-accent-fg pointer-events-none relative"
        >
          <Check className="size-3.5" strokeWidth={3} />
        </motion.span>
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-callout text-fg">{label}</span>
        {description ? <span className="text-footnote text-fg-muted">{description}</span> : null}
      </span>
    </label>
  );
}
