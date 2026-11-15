"use client";

import { Check, Trophy } from "lucide-react";
import { motion } from "motion/react";
import { NumberTicker } from "@/components/fx/NumberTicker";
import { spring } from "@/lib/motion";
import type { EntryColour } from "@/lib/hemicycle";
import { cn } from "./cn";
import { colourVar } from "./Hemicycle";

export type RankedRow = {
  entryId: number;
  name: string;
  votes: number;
  /** Shared on ties (1, 1, 3). */
  rank: number;
  colour: EntryColour | undefined;
  winner?: boolean;
  /** The connected wallet voted for this entry. */
  mine?: boolean;
};

/** Whole-number share of the total, for the bar and the label. */
export function percentOf(votes: number, total: number): number {
  return total > 0 ? Math.round((votes / total) * 100) : 0;
}

export type RankedListProps = {
  rows: readonly RankedRow[];
  total: number;
  highlight?: number | null;
  onHighlight?: (entryId: number | null) => void;
  /** Rows become buttons (e.g. open the entry). */
  onSelect?: (entryId: number) => void;
  className?: string;
};

/**
 * Rank, colour dot, name, count and a % bar per entry. Rows slide to their new place when ranks
 * change (layout animation; a cross-fade under reduced motion via MotionConfig). This list is the
 * accessible version of the Hemicycle.
 */
export function RankedList({ rows, total, highlight = null, onHighlight, onSelect, className }: RankedListProps) {
  return (
    <ol aria-label="Ranking" className={cn("flex flex-col", className)} onPointerLeave={() => onHighlight?.(null)}>
      {rows.map((row) => {
        const pct = percentOf(row.votes, total);
        const dim = highlight !== null && highlight !== row.entryId;
        const body = (
          <>
            <span className="text-footnote text-fg-muted tabular w-5 shrink-0 text-right" aria-hidden>
              {row.rank}
            </span>
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: colourVar(row.colour) }}
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="text-callout text-fg truncate">{row.name}</span>
                {row.winner ? (
                  <Trophy aria-label="Winner" className="text-prize-text size-3.5 shrink-0" strokeWidth={2} />
                ) : null}
                {row.mine ? (
                  <Check aria-label="Your vote" className="text-verified-text size-3.5 shrink-0" strokeWidth={2.5} />
                ) : null}
              </span>
              <span aria-hidden className="bg-fg/7 mt-1.5 block h-1 overflow-hidden rounded-full">
                <motion.span
                  className="block h-full origin-left rounded-full"
                  style={{ backgroundColor: colourVar(row.colour) }}
                  initial={false}
                  animate={{ scaleX: pct / 100 }}
                  transition={spring.smooth}
                />
              </span>
            </span>
            <span aria-hidden className="flex w-16 shrink-0 flex-col items-end">
              <NumberTicker value={row.votes} className="text-callout text-fg font-medium" />
              <span className="text-caption text-fg-muted tabular">
                {pct}%
              </span>
            </span>
            <span className="sr-only">
              {`Rank ${row.rank}, ${row.votes} ${row.votes === 1 ? "vote" : "votes"}, ${pct} percent`}
            </span>
          </>
        );
        const rowClass = cn(
          "flex w-full items-center gap-3 rounded-sm px-2 py-2.5 text-left transition-opacity duration-200",
          dim && "opacity-45",
          highlight === row.entryId && "bg-fg/4",
        );
        return (
          <motion.li
            key={row.entryId}
            layout="position"
            transition={spring.smooth}
            data-entry={row.entryId}
            onPointerEnter={() => onHighlight?.(row.entryId)}
          >
            {onSelect ? (
              <button
                type="button"
                className={cn(rowClass, "hover:bg-fg/5 focus-visible:bg-fg/5")}
                onClick={() => onSelect(row.entryId)}
                onFocus={() => onHighlight?.(row.entryId)}
                onBlur={() => onHighlight?.(null)}
              >
                {body}
              </button>
            ) : (
              <div className={rowClass}>{body}</div>
            )}
          </motion.li>
        );
      })}
    </ol>
  );
}
