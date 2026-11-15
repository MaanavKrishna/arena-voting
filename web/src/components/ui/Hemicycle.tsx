"use client";

import { AnimatePresence, motion } from "motion/react";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, type ReactNode } from "react";
import { fade, spring } from "@/lib/motion";
import {
  OTHER_ENTRY_ID,
  hemicycleSeats,
  type EntryColour,
  type Seat,
} from "@/lib/hemicycle";
import { cn } from "./cn";
import { useReducedMotionPref } from "./hooks";

const INNER = 0.4;
/** Sweep from left to right on first appearance, whatever the seat count. */
const SWEEP_SECONDS = 0.5;

/** CSS colour for an entry's palette slot (design-system §2.3). */
export function colourVar(colour: EntryColour | undefined): string {
  return colour === undefined || colour === "other" ? "var(--color-entry-other)" : `var(--color-entry-${colour})`;
}

/** "Results: Robo Chef 12 votes, Others 3 votes." — the Hemicycle's accessible summary. */
export function resultsSummary(
  counts: readonly { entryId: number; votes: number }[],
  names: ReadonlyMap<number, string>,
): string {
  const ranked = counts
    .filter((c) => c.votes > 0)
    .sort((a, b) => {
      const ao = a.entryId === OTHER_ENTRY_ID ? 1 : 0;
      const bo = b.entryId === OTHER_ENTRY_ID ? 1 : 0;
      return ao - bo || b.votes - a.votes || a.entryId - b.entryId;
    });
  if (ranked.length === 0) return "Results: no votes yet.";
  const parts = ranked.map((c) => {
    const name = c.entryId === OTHER_ENTRY_ID ? "Others" : (names.get(c.entryId) ?? `Entry ${c.entryId}`);
    return `${name} ${c.votes} ${c.votes === 1 ? "vote" : "votes"}`;
  });
  return `Results: ${parts.join(", ")}.`;
}

/** Half-annulus between two radii (SVG y is down, so the arc sits above the baseline). */
export function chamberPath(inner: number, outer: number): string {
  return `M ${-outer} 0 A ${outer} ${outer} 0 0 1 ${outer} 0 L ${inner} 0 A ${inner} ${inner} 0 0 0 ${-inner} 0 Z`;
}

/** Stable identity for a seat: the k-th seat of an entry keeps its key while the layout changes. */
export function seatKey(entryId: number, k: number): string {
  return `${entryId}:${k}`;
}

export type KeyedSeat = Seat & { key: string; r: number };

/** Seat radius (unit coordinates) that leaves a gap between neighbours in every row. */
export function seatRadius(seats: readonly { row: number }[]): number {
  if (seats.length === 0) return 0;
  const perRow = new Map<number, number>();
  for (const s of seats) perRow.set(s.row, (perRow.get(s.row) ?? 0) + 1);
  const rows = perRow.size;
  const gap = rows > 1 ? (1 - INNER) / (rows - 1) : Infinity;
  let arc = Infinity;
  for (const [row, count] of perRow) {
    if (count < 2) continue;
    const radius = rows === 1 ? 1 : INNER + (row * (1 - INNER)) / (rows - 1);
    arc = Math.min(arc, (Math.PI * radius) / (count - 1));
  }
  return Math.min(0.42 * Math.min(gap, arc), 0.09);
}

/**
 * Seats with keys and radius; memoised by the caller. While the tally fits the fixed chamber the
 * radius comes from the whole chamber grid, so seats and the empty slots around them match in size.
 * `empty` is that grid's unfilled slots (the faint placeholder dots).
 */
export function keyedSeats(counts: readonly { entryId: number; votes: number }[]) {
  const result = hemicycleSeats(counts);
  const r = seatRadius(result.chamber.length > 0 ? result.chamber : result.seats);
  const seen = new Map<number, number>();
  const seats: KeyedSeat[] = result.seats.map((s) => {
    const k = seen.get(s.entryId) ?? 0;
    seen.set(s.entryId, k + 1);
    return { ...s, key: seatKey(s.entryId, k), r };
  });
  return { seats, perSeat: result.perSeat, placeholder: result.placeholder, perEntry: seen, empty: result.empty, r };
}

export type HemicycleHandle = {
  /** Viewport point of the newest seat of an entry (where it will rest), for VoteBeam. */
  pointFor: (entryId: number) => { x: number; y: number } | null;
  element: () => SVGSVGElement | null;
};

export type HemicycleProps = {
  /** Votes per entry. Use entry id 0 for the grouped "Others" wedge. */
  counts: readonly { entryId: number; votes: number }[];
  colours: ReadonlyMap<number, EntryColour>;
  /** Names for the accessible summary and seat tooltips. */
  names: ReadonlyMap<number, string>;
  /** Entry to emphasise (others dim). */
  highlight?: number | null;
  onHighlight?: (entryId: number | null) => void;
  /** Keep this entry's newest seat hidden (VoteBeam is flying to it); release to pop it in. */
  holdEntry?: number | null;
  /** Shown in the middle of the arc (e.g. the vote total). */
  children?: ReactNode;
  className?: string;
};

/**
 * Parliament-style results: one seat per vote, each entry a wedge (design-system §9). Seats glide
 * when ranks change and new seats pop in with `spring.celebrate`; under reduced motion they
 * cross-fade instead. Small tallies sit in the middle of a faint 24-slot chamber that fills outward;
 * with no votes it shows that chamber empty.
 */
export const Hemicycle = forwardRef<HemicycleHandle, HemicycleProps>(function Hemicycle(
  { counts, colours, names, highlight = null, onHighlight, holdEntry = null, children, className },
  ref,
) {
  const svgRef = useRef<SVGSVGElement>(null);
  const reduce = useReducedMotionPref();
  const model = useMemo(() => keyedSeats(counts), [counts]);
  const summary = useMemo(() => resultsSummary(counts, names), [counts, names]);

  // Seats that were already on screen glide; the first render sweeps in; later arrivals pop.
  const firstPaint = useRef(true);
  useEffect(() => {
    firstPaint.current = false;
  }, []);

  const heldKey =
    holdEntry !== null && model.perEntry.has(holdEntry)
      ? seatKey(holdEntry, (model.perEntry.get(holdEntry) ?? 1) - 1)
      : null;

  useImperativeHandle(
    ref,
    () => ({
      element: () => svgRef.current,
      pointFor: (entryId) => {
        const svg = svgRef.current;
        const count = model.perEntry.get(entryId);
        if (!svg || !count) return null;
        const seat = model.seats.find((s) => s.key === seatKey(entryId, count - 1));
        const ctm = svg.getScreenCTM?.();
        if (!seat || !ctm) return null;
        const p = new DOMPoint(seat.x, -seat.y).matrixTransform(ctm);
        return { x: p.x, y: p.y };
      },
    }),
    [model],
  );

  const inChamber = model.empty.length > 0 || model.placeholder;
  const slotR = model.r;
  const pad = 0.1;

  return (
    <div className={cn("relative", className)}>
      <svg
        ref={svgRef}
        role="img"
        aria-label={summary}
        viewBox={`${-1 - pad} ${-1 - pad} ${2 + 2 * pad} ${1 + 2 * pad}`}
        className="block h-auto w-full overflow-visible"
        onPointerLeave={() => onHighlight?.(null)}
      >
        {/* Large tallies: a faint half-ring behind the seats. Small ones show empty slots instead. */}
        {!inChamber ? (
          <path aria-hidden d={chamberPath(INNER - 0.1, 1 + 0.06)} fill="var(--color-fg)" opacity={0.035} />
        ) : null}
        {inChamber ? (
          <g data-testid="hemicycle-placeholder" aria-hidden>
            {model.empty.map((p) => (
              <circle
                key={`${p.row}:${p.index}`}
                cx={p.x}
                cy={-p.y}
                r={slotR * 0.55}
                fill="var(--color-border-strong)"
                opacity={0.45}
              />
            ))}
          </g>
        ) : null}
        <AnimatePresence initial={!reduce}>
          {model.seats.map((s) => {
            const held = s.key === heldKey;
            const dim = highlight !== null && highlight !== s.entryId;
            const delay = firstPaint.current ? (s.index / Math.max(model.seats.length, 1)) * SWEEP_SECONDS : 0;
            const name = s.entryId === OTHER_ENTRY_ID ? "Others" : (names.get(s.entryId) ?? `Entry ${s.entryId}`);
            return (
              <motion.circle
                key={s.key}
                data-seat={s.key}
                data-entry={s.entryId}
                cx={0}
                cy={0}
                r={s.r}
                fill={colourVar(colours.get(s.entryId))}
                initial={{ x: s.x, y: -s.y, scale: 0, opacity: 0 }}
                animate={{
                  x: s.x,
                  y: -s.y,
                  scale: held ? 0 : 1,
                  opacity: held ? 0 : dim ? 0.22 : 1,
                }}
                exit={{ scale: 0, opacity: 0, transition: fade }}
                transition={{
                  x: spring.smooth,
                  y: spring.smooth,
                  scale: { ...spring.celebrate, delay },
                  opacity: { ...fade, delay: dim || highlight !== null ? 0 : delay },
                }}
                onPointerEnter={() => onHighlight?.(s.entryId)}
                onClick={() => onHighlight?.(highlight === s.entryId ? null : s.entryId)}
                style={{ transformBox: "fill-box", transformOrigin: "center" }}
              >
                <title>{name}</title>
              </motion.circle>
            );
          })}
        </AnimatePresence>
      </svg>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center">
        {model.placeholder ? (
          <p className="text-callout text-fg-muted pb-1" data-testid="hemicycle-empty">
            No votes yet
          </p>
        ) : (
          children
        )}
      </div>
      {model.perSeat > 1 ? (
        <p className="text-footnote text-fg-muted mt-2 text-center" data-testid="hemicycle-scale">
          1 seat = {model.perSeat} votes
        </p>
      ) : null}
    </div>
  );
});
