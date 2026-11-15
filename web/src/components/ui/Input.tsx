"use client";

import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";
import { controlClass, useField } from "./Field";

export type InputProps = ComponentProps<"input"> & {
  /** Leading adornment (icon or unit). */
  leading?: ReactNode;
  /** Trailing adornment, e.g. "ETH". */
  trailing?: ReactNode;
};

export function Input({ className, leading, trailing, id, "aria-invalid": ariaInvalid, ...rest }: InputProps) {
  const field = useField();
  const input = (
    <input
      id={id ?? field?.id}
      aria-describedby={field?.describedBy}
      aria-invalid={ariaInvalid ?? (field?.invalid || undefined)}
      className={cn(controlClass, "h-11 px-3", leading ? "pl-10" : null, trailing ? "pr-14" : null, className)}
      {...rest}
    />
  );
  if (!leading && !trailing) return input;
  return (
    <div className="relative">
      {leading ? (
        <span className="text-fg-muted pointer-events-none absolute inset-y-0 left-3 flex items-center">{leading}</span>
      ) : null}
      {input}
      {trailing ? (
        <span className="text-footnote text-fg-muted pointer-events-none absolute inset-y-0 right-3 flex items-center">
          {trailing}
        </span>
      ) : null}
    </div>
  );
}
