"use client";

import type { ComponentProps } from "react";
import { cn } from "./cn";
import { controlClass, useField } from "./Field";

/** Grows with its content (field-sizing) where supported. */
export function Textarea({ className, id, "aria-invalid": ariaInvalid, rows = 4, ...rest }: ComponentProps<"textarea">) {
  const field = useField();
  return (
    <textarea
      id={id ?? field?.id}
      rows={rows}
      aria-describedby={field?.describedBy}
      aria-invalid={ariaInvalid ?? (field?.invalid || undefined)}
      className={cn(controlClass, "field-sizing-content min-h-24 resize-none px-3 py-2.5", className)}
      {...rest}
    />
  );
}
