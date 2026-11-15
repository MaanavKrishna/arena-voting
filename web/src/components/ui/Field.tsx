"use client";

import { AlertCircle } from "lucide-react";
import { createContext, useContext, useId, type ReactNode } from "react";
import { cn } from "./cn";

type FieldContextValue = { id: string; describedBy?: string; invalid: boolean };
const FieldContext = createContext<FieldContextValue | null>(null);

/** Inputs inside a <Field> pick up its id, aria-describedby and aria-invalid. */
export function useField(): FieldContextValue | null {
  return useContext(FieldContext);
}

export function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export type FieldProps = {
  label: ReactNode;
  /** Helper text under the control. Replaced by `error` when present. */
  helper?: ReactNode;
  /** Inline validation message (show it after blur, not while typing). */
  error?: ReactNode;
  /** Byte-limit counter: pass the current value and the contract limit. */
  counter?: { value: string; max: number };
  optional?: boolean;
  className?: string;
  children: ReactNode;
};

export function Field({ label, helper, error, counter, optional, className, children }: FieldProps) {
  const id = useId();
  const helperId = `${id}-helper`;
  const counterId = `${id}-counter`;
  const bytes = counter ? byteLength(counter.value) : 0;
  const over = counter ? bytes > counter.max : false;
  const invalid = Boolean(error) || over;
  const describedBy = [helper || error ? helperId : null, counter ? counterId : null].filter(Boolean).join(" ") || undefined;

  return (
    <FieldContext value={{ id, describedBy, invalid }}>
      <div className={cn("flex flex-col gap-1.5", className)}>
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={id} className="text-footnote text-fg">
            {label}
            {optional ? <span className="text-fg-muted"> (optional)</span> : null}
          </label>
          {counter ? (
            <span
              id={counterId}
              aria-live={over ? "polite" : "off"}
              className={cn("text-caption tabular", over ? "text-danger-text" : "text-fg-muted")}
            >
              {bytes}/{counter.max}
              <span className="sr-only"> bytes used</span>
            </span>
          ) : null}
        </div>
        {children}
        {error ? (
          <p id={helperId} className="text-footnote text-danger-text flex items-center gap-1.5">
            <AlertCircle aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
            {error}
          </p>
        ) : helper ? (
          <p id={helperId} className="text-footnote text-fg-muted">
            {helper}
          </p>
        ) : null}
      </div>
    </FieldContext>
  );
}

/** Shared control chrome for Input, Textarea and DateTimeField. */
export const controlClass = cn(
  "w-full rounded-sm bg-bg-elevated text-callout text-fg shadow-sm",
  "border border-border-strong hover:border-fg-muted",
  "transition-[border-color,box-shadow] duration-150",
  "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:border-transparent",
  "aria-invalid:border-danger aria-invalid:hover:border-danger",
  "disabled:cursor-not-allowed disabled:opacity-50",
);
