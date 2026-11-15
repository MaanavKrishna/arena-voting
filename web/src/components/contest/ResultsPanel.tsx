"use client";

import { Trophy } from "lucide-react";
import { forwardRef, useState } from "react";
import { NumberTicker } from "@/components/fx/NumberTicker";
import { cn } from "@/components/ui/cn";
import { Hemicycle, colourVar, type HemicycleHandle } from "@/components/ui/Hemicycle";
import { RankedList, type RankedRow } from "@/components/ui/RankedList";
import { currencyLabel } from "@/config/network";
import type { EntryColour } from "@/lib/hemicycle";
import { formatEth } from "@/lib/format";
import type { Phase } from "@/lib/phase";

export type ResultsPanelProps = {
  phase: Phase | undefined;
  rows: readonly RankedRow[];
  counts: readonly { entryId: number; votes: number }[];
  colours: ReadonlyMap<number, EntryColour>;
  names: ReadonlyMap<number, string>;
  total: number;
  winners: readonly number[];
  share: bigint;
  holdEntry: number | null;
  onSelect: (entryId: number) => void;
  className?: string;
};

function WinnerNote({ winners, names, share }: { winners: readonly number[]; names: ReadonlyMap<number, string>; share: bigint }) {
  if (winners.length === 0) {
    return (
      <p className="text-callout text-fg-muted">
        No votes were cast, so the prize went back to the organiser.
      </p>
    );
  }
  const list = winners.map((id) => names.get(id) ?? `Entry ${id}`);
  const label = list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
  return (
    <div className="bg-prize/12 flex items-start gap-3 rounded-sm px-4 py-3">
      <Trophy className="text-prize-text mt-0.5 size-5 shrink-0" strokeWidth={1.75} aria-hidden />
      <div className="min-w-0">
        <p className="text-callout text-fg">
          {winners.length === 1 ? "Winner: " : "Tied winners: "}
          <span className="font-semibold">{label}</span>
        </p>
        <p className="text-footnote text-fg-muted">
          {winners.length === 1 ? "Takes" : "Each takes"} {formatEth(share)} {currencyLabel}
        </p>
      </div>
    </div>
  );
}

/** Live results: the Hemicycle (signature visual) over the ranked list. */
export const ResultsPanel = forwardRef<HemicycleHandle, ResultsPanelProps>(function ResultsPanel(
  { phase, rows, counts, colours, names, total, winners, share, holdEntry, onSelect, className },
  ref,
) {
  const [highlight, setHighlight] = useState<number | null>(null);
  const live = phase === "voting";
  const leader = rows[0] && rows[0].votes > 0 ? rows[0] : null;

  return (
    <section
      aria-labelledby="results-title"
      className={cn("solid squircle shadow-sm relative overflow-hidden rounded-lg p-5 md:p-6", className)}
    >
      {/* Static glow in the leader's colour: depth without another ambient effect. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-48 opacity-50"
        style={{
          backgroundImage: `radial-gradient(60% 100% at 50% 0%, color-mix(in oklch, ${colourVar(
            leader ? colours.get(leader.entryId) : undefined,
          )} 22%, transparent), transparent)`,
        }}
      />
      <div className="relative flex items-center justify-between gap-3">
        <h2 id="results-title" className="text-title-3 text-fg">
          {phase === "finalized" ? "Final results" : "Results"}
        </h2>
        {live ? (
          <span className="text-caption text-fg-muted inline-flex items-center gap-1.5">
            <span aria-hidden className="relative inline-flex size-1.5">
              <span className="animate-live-pulse bg-live absolute inset-0 rounded-full" />
              <span className="bg-live relative inline-flex size-1.5 rounded-full" />
            </span>
            Updating live
          </span>
        ) : null}
      </div>

      <Hemicycle
        ref={ref}
        className="relative mx-auto mt-4 max-w-md"
        counts={counts}
        colours={colours}
        names={names}
        highlight={highlight}
        onHighlight={setHighlight}
        holdEntry={holdEntry}
      >
        <span className="text-title-1 text-fg tabular">
          <NumberTicker value={total} />
        </span>
        <span className="text-footnote text-fg-muted">{total === 1 ? "vote" : "votes"}</span>
      </Hemicycle>

      {phase === "finalized" ? (
        <div className="relative mt-5">
          <WinnerNote winners={winners} names={names} share={share} />
        </div>
      ) : null}

      {rows.length > 0 ? (
        <RankedList
          className="relative -mx-2 mt-4"
          rows={rows}
          total={total}
          highlight={highlight}
          onHighlight={setHighlight}
          onSelect={onSelect}
        />
      ) : null}
    </section>
  );
});
