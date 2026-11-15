import { liveEntries, shareOf, winnersOf } from "@/components/contest/contestLogic";
import type { Phase } from "@/lib/phase";

/**
 * Pure rules behind the Stage winner reveal (docs/product.md F5/F6, docs/contracts.md finalize).
 * No React here: everything is unit tested in reveal.test.ts.
 */

type EntryLike = { id: number; votes: number; removed: boolean };

export type RevealOutcome =
  /** Voting still open (or not yet open): the Stage keeps its live results. */
  | { kind: "live" }
  /** Voting has closed but nobody has called `finalize` yet. */
  | { kind: "closed" }
  /** One entry has the top count. */
  | { kind: "winner"; winners: [number]; share: bigint }
  /** Several entries share the top count; the prize is split equally. */
  | { kind: "tie"; winners: number[]; share: bigint }
  /** No votes (or no entries): the whole prize goes back to the organiser. */
  | { kind: "no-votes"; refund: bigint };

export type RevealKind = RevealOutcome["kind"];

/**
 * What the Stage shows once voting is over. The winners follow the same rule as the contract's
 * `finalize` (every live entry with the top count, if above zero), so the reveal can never name
 * someone the contract didn't pay.
 */
export function revealOutcome(input: {
  phase: Phase | undefined;
  entries: readonly EntryLike[] | undefined;
  prize: bigint;
}): RevealOutcome {
  const { phase, prize } = input;
  if (phase !== "ended" && phase !== "finalized") return { kind: "live" };
  if (phase === "ended") return { kind: "closed" };
  const winners = winnersOf(input.entries ?? []);
  if (winners.length === 0) return { kind: "no-votes", refund: prize };
  const share = shareOf(prize, winners.length);
  if (winners.length === 1) return { kind: "winner", winners: [winners[0]!], share };
  return { kind: "tie", winners, share };
}

/** `?preview=reveal` / `?preview=closed`: dev-only (E2E flag) previews of the ended states. */
export type RevealPreview = "reveal" | "closed" | null;

export function parseRevealPreview(param: string | null | undefined, enabled: boolean): RevealPreview {
  if (!enabled) return null;
  return param === "reveal" || param === "closed" ? param : null;
}

/** The phase the reveal should act on: a preview pretends the contest has ended or been finalised. */
export function effectivePhase(phase: Phase | undefined, preview: RevealPreview): Phase | undefined {
  if (preview === "reveal") return "finalized";
  if (preview === "closed") return "ended";
  return phase;
}

// ---- the sequence -------------------------------------------------------------------------------

export type RevealStep = "count-3" | "count-2" | "count-1" | "gather" | "card";

/** One beat of the countdown. Slow on purpose: the room should feel it land. */
export const COUNT_MS = 900;
/** Seats travel to the winner's wedge. */
export const GATHER_MS = 1100;

/**
 * Step timeline, as `[step, startsAtMs]`. A full-motion win or tie counts down 3·2·1, gathers the
 * seats, then raises the card. No votes has nothing to gather or count to, and reduced motion skips
 * straight to the card (cross-fades only).
 */
export function revealTimeline(kind: RevealKind, reduced: boolean): [RevealStep, number][] {
  if (reduced || kind === "no-votes") return [["card", 0]];
  return [
    ["count-3", 0],
    ["count-2", COUNT_MS],
    ["count-1", COUNT_MS * 2],
    ["gather", COUNT_MS * 3],
    ["card", COUNT_MS * 3 + GATHER_MS],
  ];
}

/** The step showing `elapsed` ms into the sequence. */
export function revealStepAt(elapsed: number, kind: RevealKind, reduced: boolean): RevealStep {
  const timeline = revealTimeline(kind, reduced);
  let step = timeline[0]![0];
  for (const [s, at] of timeline) if (elapsed >= at) step = s;
  return step;
}

export const countdownNumber = (step: RevealStep): number | null =>
  step === "count-3" ? 3 : step === "count-2" ? 2 : step === "count-1" ? 1 : null;

/** Confetti only for a real winner (or winners), only in full motion, only once the card is up. */
export function shouldCelebrate(kind: RevealKind, step: RevealStep, reduced: boolean): boolean {
  return !reduced && step === "card" && (kind === "winner" || kind === "tie");
}

// ---- seat gathering -----------------------------------------------------------------------------

type Point = { x: number; y: number };

/**
 * Where each seat travels when the hemicycle collapses: winner seats stay put; every other seat
 * (Others included) heads for the centre of the nearest winner's wedge. Keyed by seat key.
 */
export function gatherTargets(
  seats: readonly { key: string; entryId: number; x: number; y: number }[],
  winners: readonly number[],
): Map<string, Point & { stays: boolean }> {
  const sums = new Map<number, { x: number; y: number; n: number }>();
  for (const s of seats) {
    if (!winners.includes(s.entryId)) continue;
    const c = sums.get(s.entryId) ?? { x: 0, y: 0, n: 0 };
    c.x += s.x;
    c.y += s.y;
    c.n += 1;
    sums.set(s.entryId, c);
  }
  const centres = [...sums.values()].map((c) => ({ x: c.x / c.n, y: c.y / c.n }));
  const out = new Map<string, Point & { stays: boolean }>();
  for (const s of seats) {
    if (winners.includes(s.entryId) || centres.length === 0) {
      out.set(s.key, { x: s.x, y: s.y, stays: true });
      continue;
    }
    let best = centres[0]!;
    let bestD = Infinity;
    for (const c of centres) {
      const d = (c.x - s.x) ** 2 + (c.y - s.y) ** 2;
      if (d < bestD) {
        best = c;
        bestD = d;
      }
    }
    out.set(s.key, { x: best.x, y: best.y, stays: false });
  }
  return out;
}

/** Share of the vote, rounded, for the winner card ("42%"). */
export function voteShare(votes: number, entries: readonly EntryLike[]): number {
  const total = liveEntries(entries).reduce((a, e) => a + e.votes, 0);
  return total === 0 ? 0 : Math.round((votes / total) * 100);
}
