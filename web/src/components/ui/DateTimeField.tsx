"use client";

import { Globe } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "./cn";
import { controlClass, useField } from "./Field";

const pad = (n: number) => String(n).padStart(2, "0");

/** Date → `YYYY-MM-DDTHH:mm` in local time (the datetime-local value format). */
export function toLocalInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `YYYY-MM-DDTHH:mm` (local) → unix seconds, or null when empty/invalid. */
export function localInputToUnix(value: string): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

export type DateTimePreset = { label: string; at: (now: Date) => Date };

export const defaultPresets: DateTimePreset[] = [
  { label: "In 1 hour", at: (n) => new Date(Math.ceil((n.getTime() + 3_600_000) / 300_000) * 300_000) },
  {
    label: "Tonight 7 pm",
    at: (n) => {
      const d = new Date(n);
      d.setHours(19, 0, 0, 0);
      if (d <= n) d.setDate(d.getDate() + 1);
      return d;
    },
  },
  {
    label: "Tomorrow 9 am",
    at: (n) => {
      const d = new Date(n);
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
];

const noop = () => () => {};
function useTimeZone(): string | null {
  // Client-only (the server's zone is not the person's); null during SSR/hydration.
  return useSyncExternalStore(
    noop,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null,
  );
}

export type DateTimeFieldProps = {
  /** `YYYY-MM-DDTHH:mm` local. */
  value: string;
  onChange: (value: string) => void;
  /** Reference time for presets, unix seconds (chain time in the app). */
  now: number;
  presets?: DateTimePreset[];
  min?: string;
  disabled?: boolean;
  onBlur?: () => void;
  className?: string;
};

/** Native datetime-local + preset chips + the person's timezone. Use inside <Field>. */
export function DateTimeField({
  value,
  onChange,
  now,
  presets = defaultPresets,
  min,
  disabled,
  onBlur,
  className,
}: DateTimeFieldProps) {
  const field = useField();
  const tz = useTimeZone();
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="relative">
        <input
          type="datetime-local"
          id={field?.id}
          aria-describedby={field?.describedBy}
          aria-invalid={field?.invalid || undefined}
          value={value}
          min={min}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className={cn(controlClass, "tabular h-11 px-3")}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((p) => {
          const v = toLocalInputValue(p.at(new Date(now * 1000)));
          const active = v === value;
          return (
            <button
              key={p.label}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onChange(v)}
              className={cn(
                "text-footnote relative h-8 rounded-full border px-3 transition-colors after:absolute after:-inset-y-1.5 after:inset-x-0",
                active
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-fg-muted hover:text-fg hover:border-border-strong",
              )}
            >
              {p.label}
            </button>
          );
        })}
        <span className="text-caption text-fg-muted ml-auto inline-flex items-center gap-1" suppressHydrationWarning>
          <Globe aria-hidden className="size-3.5" strokeWidth={1.75} />
          {tz ?? "Local time"}
        </span>
      </div>
    </div>
  );
}
