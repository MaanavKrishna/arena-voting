"use client";

import { CalendarClock, Sun } from "lucide-react";
import { useMemo } from "react";
import { DateTimeField, localInputToUnix } from "@/components/ui/DateTimeField";
import { Field } from "@/components/ui/Field";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { cn } from "@/lib/cn";
import { presetTimes, type StepProps, type TimingPreset } from "./draft";

const PRESETS: { id: TimingPreset; label: string; icon: typeof Sun; hint: string }[] = [
  { id: "demo-day", label: "Demo day today", icon: Sun, hint: "Entries close in about an hour, then voting runs for an hour." },
  { id: "weekend", label: "This weekend", icon: CalendarClock, hint: "Entries close Saturday morning, voting runs for a day." },
];

function length(start: string, end: string): string | null {
  const a = localInputToUnix(start);
  const b = localInputToUnix(end);
  if (a === null || b === null || b <= a) return null;
  const s = b - a;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${+(s / 3600).toFixed(1)} h`;
  return `${+(s / 86400).toFixed(1)} days`;
}

export function StepTiming({ draft, set, errors, blur, now }: StepProps) {
  const active = useMemo(
    () => PRESETS.find((p) => {
      const t = presetTimes(p.id, now);
      return t.submissionEnd === draft.submissionEnd && t.votingStart === draft.votingStart && t.votingEnd === draft.votingEnd;
    })?.id,
    [draft.submissionEnd, draft.votingStart, draft.votingEnd, now],
  );
  const lasts = length(draft.votingStart, draft.votingEnd);

  return (
    <div className="flex flex-col gap-7">
      <section className="flex flex-col gap-3" aria-labelledby="entries-mode">
        <h3 id="entries-mode" className="text-footnote text-fg">
          Who adds entries?
        </h3>
        <SegmentedControl
          aria-label="Who adds entries"
          stretch
          value={draft.openSubmissions ? "open" : "curated"}
          onChange={(v) => set({ openSubmissions: v === "open" })}
          options={[
            { value: "curated", label: "Just me" },
            { value: "open", label: "Anyone" },
          ]}
        />
        <p className="text-footnote text-fg-muted">
          {draft.openSubmissions
            ? "Anyone with the link can submit an entry until entries close. You can still add your own."
            : "Only you can add entries. Good when you already know who is competing."}
        </p>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="quick-start">
        <h3 id="quick-start" className="text-footnote text-fg">
          Quick start
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={active === p.id}
              onClick={() => set(presetTimes(p.id, now))}
              className={cn(
                "squircle flex min-h-11 flex-col gap-1 rounded-md border p-3.5 text-left transition-[border-color,background-color,transform] duration-150 active:scale-[0.99]",
                active === p.id ? "border-accent bg-accent/8" : "border-border-strong hover:border-fg-muted",
              )}
            >
              <span className="text-callout text-fg inline-flex items-center gap-2">
                <p.icon className="text-accent size-4" strokeWidth={1.75} aria-hidden />
                {p.label}
              </span>
              <span className="text-footnote text-fg-muted">{p.hint}</span>
            </button>
          ))}
        </div>
        <p className="text-footnote text-fg-muted">Or pick your own times below.</p>
      </section>

      <div className="flex flex-col gap-6">
        <Field label="Entries close" error={errors.submissionEnd} helper="The last moment an entry can be added.">
          <DateTimeField
            presets={[]}
            now={now}
            value={draft.submissionEnd}
            onChange={(submissionEnd) => set({ submissionEnd })}
            onBlur={() => blur("submissionEnd")}
          />
        </Field>
        <Field label="Voting opens" error={errors.votingStart} helper="Can be the same moment entries close.">
          <DateTimeField
            presets={[]}
            now={now}
            value={draft.votingStart}
            onChange={(votingStart) => set({ votingStart })}
            onBlur={() => blur("votingStart")}
          />
        </Field>
        <Field
          label="Voting closes"
          error={errors.votingEnd}
          helper={lasts ? `Voting stays open for ${lasts}. It has to be between 5 minutes and 7 days.` : "Voting stays open for 5 minutes to 7 days."}
        >
          <DateTimeField
            presets={[]}
            now={now}
            value={draft.votingEnd}
            onChange={(votingEnd) => set({ votingEnd })}
            onBlur={() => blur("votingEnd")}
          />
        </Field>
      </div>
      <p className="text-footnote text-fg-muted -mt-2">
        Dates can&apos;t be changed after you create the contest. They&apos;re checked against the network clock, not your device.
      </p>
    </div>
  );
}
