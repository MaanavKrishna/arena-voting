"use client";

import { HandCoins, Trophy } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { EntryImage } from "@/components/contest/EntryImage";
import { tickerParts } from "@/components/contest/contestLogic";
import { Confetti } from "@/components/fx/hero/Confetti";
import { NumberTicker } from "@/components/fx/NumberTicker";
import { Badge } from "@/components/ui/Badge";
import { chamberPath, colourVar, keyedSeats } from "@/components/ui/Hemicycle";
import { cn } from "@/components/ui/cn";
import { useReducedMotionPref } from "@/components/ui/hooks";
import { currencyLabel } from "@/config/network";
import type { EntryColour } from "@/lib/hemicycle";
import { formatEth } from "@/lib/format";
import { fade, spring } from "@/lib/motion";
import {
  GATHER_MS,
  countdownNumber,
  gatherTargets,
  revealStepAt,
  revealTimeline,
  shouldCelebrate,
  voteShare,
  type RevealOutcome,
} from "./reveal";

export type RevealEntry = {
  id: number;
  votes: number;
  removed: boolean;
  name: string;
  image: string | undefined;
};

export type RevealModel = {
  counts: { entryId: number; votes: number }[];
  colours: ReadonlyMap<number, EntryColour>;
  total: number;
};

type Finished = Exclude<RevealOutcome, { kind: "live" } | { kind: "closed" }>;

export type RevealSequenceProps = {
  outcome: Finished;
  entries: readonly RevealEntry[];
  model: RevealModel;
  /** Header actions (Replay for the organiser). */
  actions?: ReactNode;
};

const INNER = 0.4;
const PAD = 0.1;
/** Material entrance (design-system §6): opacity, a little scale, blur to sharp. */
const materialise = { opacity: 0, scale: 0.96, filter: "blur(8px)" };
const settled = { opacity: 1, scale: 1, filter: "blur(0px)" };

/**
 * The keynote moment. A calm build-up (3·2·1 over the frozen hemicycle), the seats gather into the
 * winner's wedge, then one decisive reveal: the winner card rises and confetti bursts once.
 * Reduced motion: no countdown, no gathering, no confetti; the card cross-fades in with a static
 * Winner badge. Remount (change `key`) to replay.
 */
export function RevealSequence({ outcome, entries, model, actions }: RevealSequenceProps) {
  const reduce = useReducedMotionPref();
  const [elapsed, setElapsed] = useState(0);
  const kind = outcome.kind;

  useEffect(() => {
    const timers = revealTimeline(kind, reduce)
      .slice(1)
      .map(([, at]) => setTimeout(() => setElapsed(at), at));
    return () => timers.forEach(clearTimeout);
  }, [kind, reduce]);

  const step = revealStepAt(elapsed, kind, reduce);
  const count = countdownNumber(step);
  const winners = kind === "no-votes" ? [] : outcome.winners;
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e] as const)), [entries]);
  const winnerEntries = winners.map((id) => byId.get(id)).filter((e): e is RevealEntry => !!e);
  const colours = winners.map((id) => colourVar(model.colours.get(id)));

  const heading = step === "card" ? (kind === "winner" ? "The winner" : "Final results") : "And the winner is…";

  return (
    <div className="relative flex h-full min-h-0 flex-col p-6 md:p-8" data-reveal-step={step} data-reveal-kind={kind}>
      <div className="flex items-center justify-between gap-4">
        <AnimatePresence mode="wait" initial={false}>
          <motion.h2
            key={heading}
            className="text-title-2 text-fg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fade}
          >
            {heading}
          </motion.h2>
        </AnimatePresence>
        {actions}
      </div>

      <div className="relative grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] place-items-center pt-2 [&>*]:col-start-1 [&>*]:row-start-1">
        {/* Layer 1: the hemicycle, frozen, then gathering into the winner's wedge, then a quiet backdrop. */}
        {kind !== "no-votes" ? (
          <motion.div
            className="flex size-full min-h-0 items-center justify-center"
            initial={false}
            animate={
              step === "card"
                ? { opacity: reduce ? 0 : 0.1, scale: reduce ? 1 : 0.92, filter: reduce ? "blur(0px)" : "blur(4px)" }
                : count !== null
                  ? { opacity: 0.45, scale: 1, filter: "blur(0px)" }
                  : { opacity: 1, scale: 1, filter: "blur(0px)" }
            }
            transition={reduce ? fade : { ...spring.smooth, visualDuration: 0.8 }}
          >
            <RevealSeats
              className="aspect-[11/6] max-h-full w-full max-w-2xl lg:h-full lg:w-auto"
              model={model}
              winners={winners}
              gathering={step === "gather" || step === "card"}
              reduce={reduce}
            />
          </motion.div>
        ) : null}

        {/* Layer 2: the countdown, one numeral at a time. */}
        <AnimatePresence>
          {count !== null ? (
            <motion.span
              key={count}
              aria-hidden
              data-testid="reveal-count"
              className="text-numeric-xl text-fg tabular pointer-events-none"
              initial={{ opacity: 0, scale: 0.86, filter: "blur(12px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 1.12, filter: "blur(8px)", transition: { duration: 0.35, ease: [0.4, 0, 1, 1] } }}
              transition={spring.smooth}
            >
              {count}
            </motion.span>
          ) : null}
        </AnimatePresence>

        {/* Layer 3: the decisive moment. */}
        {step === "card" ? (
          <div className="flex w-full min-h-0 items-center justify-center">
            {kind === "winner" && winnerEntries[0] ? (
              <WinnerCard
                entry={winnerEntries[0]}
                colour={colours[0]!}
                share={outcome.kind === "winner" ? outcome.share : 0n}
                pct={voteShare(winnerEntries[0].votes, entries)}
                celebrate={shouldCelebrate(kind, step, reduce)}
                reduce={reduce}
              />
            ) : kind === "tie" ? (
              <TieCard
                entries={winnerEntries}
                colours={colours}
                share={outcome.kind === "tie" ? outcome.share : 0n}
                celebrate={shouldCelebrate(kind, step, reduce)}
                reduce={reduce}
              />
            ) : outcome.kind === "no-votes" ? (
              <NoVotesCard refund={outcome.refund} reduce={reduce} />
            ) : null}
          </div>
        ) : null}
      </div>

      <span className="sr-only" aria-live="polite">
        {step === "card" ? announce(outcome, winnerEntries) : ""}
      </span>
    </div>
  );
}

function announce(outcome: Finished, winners: readonly RevealEntry[]): string {
  if (outcome.kind === "no-votes") return "No votes were cast. The prize goes back to the organiser.";
  const names = winners.map((w) => w.name).join(", ");
  return outcome.kind === "tie" ? `It's a tie: ${names}.` : `The winner is ${names}.`;
}

// ---- seats --------------------------------------------------------------------------------------

/**
 * The hemicycle drawn for the reveal: same geometry and colours as the live one (so the hand-off
 * from the results panel is seamless), but every seat can travel to its gather target.
 */
function RevealSeats({
  model,
  winners,
  gathering,
  reduce,
  className,
}: {
  model: RevealModel;
  winners: readonly number[];
  gathering: boolean;
  reduce: boolean;
  className?: string;
}) {
  const seats = useMemo(() => keyedSeats(model.counts).seats, [model.counts]);
  const targets = useMemo(() => gatherTargets(seats, winners), [seats, winners]);
  const spread = useMemo(() => {
    let max = 0;
    for (const s of seats) {
      const t = targets.get(s.key)!;
      max = Math.max(max, Math.hypot(t.x - s.x, t.y - s.y));
    }
    return max || 1;
  }, [seats, targets]);
  const travel = GATHER_MS / 1000;

  return (
    <div className={cn("relative", className)}>
      <svg
        aria-hidden
        viewBox={`${-1 - PAD} ${-1 - PAD} ${2 + 2 * PAD} ${1 + 2 * PAD}`}
        className="block h-auto w-full overflow-visible"
      >
        <path d={chamberPath(INNER - 0.1, 1 + 0.06)} fill="var(--color-fg)" opacity={0.035} />
        {seats.map((s) => {
          const t = targets.get(s.key)!;
          const move = gathering && !reduce && !t.stays;
          // Nearest seats set off first, so the wedge seems to pull the room in.
          const dist = Math.hypot(t.x - s.x, t.y - s.y) / spread;
          const delay = dist * travel * 0.3;
          return (
            <motion.circle
              key={s.key}
              data-seat={s.key}
              data-entry={s.entryId}
              cx={0}
              cy={0}
              r={s.r}
              fill={colourVar(model.colours.get(s.entryId))}
              initial={false}
              animate={
                move
                  ? { x: t.x, y: -t.y, scale: 0.25, opacity: 0 }
                  : { x: s.x, y: -s.y, scale: gathering && t.stays && !reduce ? 1.12 : 1, opacity: 1 }
              }
              transition={{
                x: { type: "spring", visualDuration: travel * 0.7, bounce: 0, delay },
                y: { type: "spring", visualDuration: travel * 0.7, bounce: 0, delay },
                scale: move ? { duration: travel * 0.7, ease: [0.4, 0, 0.2, 1], delay } : { ...spring.celebrate, delay: travel * 0.55 },
                opacity: { duration: travel * 0.35, ease: "easeIn", delay: delay + travel * 0.4 },
              }}
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
            />
          );
        })}
      </svg>
    </div>
  );
}

// ---- cards --------------------------------------------------------------------------------------

/** Counts up from zero once mounted (NumberTicker springs between values). */
function useCountUp(target: number, reduce: boolean): number {
  const [ready, setReady] = useState(reduce);
  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setReady(true), 350);
    return () => clearTimeout(t);
  }, [ready]);
  return ready ? target : 0;
}

function PrizeLine({ share, each, reduce }: { share: bigint; each: boolean; reduce: boolean }) {
  const { value, decimals } = tickerParts(formatEth(share));
  const shown = useCountUp(value, reduce);
  if (share === 0n) return null;
  return (
    <p className="text-title-2 text-fg-muted flex flex-wrap items-baseline justify-center gap-x-2" data-testid="reveal-prize">
      <span className="whitespace-nowrap">{each ? "Each takes" : "Takes"}</span>
      <span className="text-display text-prize-text tabular">
        <NumberTicker value={shown} decimals={decimals} />
      </span>
      <span className="text-prize-text whitespace-nowrap">{currencyLabel}</span>
    </p>
  );
}

function rise(reduce: boolean, delay = 0) {
  return reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { ...fade, delay } }
    : {
        initial: { ...materialise, y: 48 },
        animate: { ...settled, y: 0 },
        transition: { ...spring.celebrate, delay, filter: { duration: 0.4, delay } },
      };
}

function WinnerBadge() {
  return (
    <Badge tone="prize" icon={<Trophy strokeWidth={2} aria-hidden />} className="h-8 px-3.5 text-callout">
      Winner
    </Badge>
  );
}

function WinnerCard({
  entry,
  colour,
  share,
  pct,
  celebrate,
  reduce,
}: {
  entry: RevealEntry;
  colour: string;
  share: bigint;
  pct: number;
  celebrate: boolean;
  reduce: boolean;
}) {
  const votes = useCountUp(entry.votes, reduce);
  return (
    <motion.article
      {...rise(reduce)}
      data-testid="winner-card"
      className="flex w-full max-w-xl flex-col items-center gap-4 text-center"
    >
      <div className="relative">
        <WinnerBadge />
        {celebrate ? <Confetti colours={[colour, "var(--color-prize)", "var(--color-fg)"]} /> : null}
      </div>
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-lg"
        style={{ boxShadow: `0 24px 80px -24px color-mix(in oklch, ${colour} 60%, transparent)` }}
      >
        <EntryImage uri={entry.image} name={entry.name} color={colour} sizes="xl" className="rounded-lg" />
      </div>
      <h3 className="text-display text-fg line-clamp-2 max-w-full break-words">{entry.name}</h3>
      <p className="text-title-3 text-fg-muted inline-flex items-center gap-2">
        <span aria-hidden className="size-3 rounded-full" style={{ backgroundColor: colour }} />
        <NumberTicker value={votes} suffix={entry.votes === 1 ? " vote" : " votes"} />
        <span aria-hidden>·</span>
        <span className="tabular">{pct}%</span>
      </p>
      <PrizeLine share={share} each={false} reduce={reduce} />
    </motion.article>
  );
}

function TieCard({
  entries,
  colours,
  share,
  celebrate,
  reduce,
}: {
  entries: readonly RevealEntry[];
  colours: readonly string[];
  share: bigint;
  celebrate: boolean;
  reduce: boolean;
}) {
  const many = entries.length > 3;
  return (
    <motion.article {...rise(reduce)} data-testid="tie-card" className="flex w-full max-w-3xl flex-col items-center gap-5 text-center">
      <div className="relative">
        <WinnerBadge />
        {celebrate ? <Confetti colours={[...colours, "var(--color-prize)"]} /> : null}
      </div>
      <h3 className="text-display text-fg">It&apos;s a tie</h3>
      <ul className="flex w-full flex-wrap items-start justify-center gap-4 md:gap-6">
        {entries.map((e, i) => (
          <motion.li
            key={e.id}
            {...rise(reduce, 0.12 + Math.min(i, 7) * 0.06)}
            className={cn("flex flex-col items-center gap-2", many ? "w-[calc(50%-0.5rem)] md:w-36" : "w-[calc(50%-0.5rem)] md:w-52")}
          >
            <EntryImage uri={e.image} name={e.name} color={colours[i]!} className="rounded-md" />
            <span className="text-title-3 text-fg line-clamp-2 break-words">{e.name}</span>
            <span className="text-footnote text-fg-muted tabular">
              {e.votes} {e.votes === 1 ? "vote" : "votes"}
            </span>
          </motion.li>
        ))}
      </ul>
      <PrizeLine share={share} each reduce={reduce} />
    </motion.article>
  );
}

function NoVotesCard({ refund, reduce }: { refund: bigint; reduce: boolean }) {
  return (
    <motion.article {...rise(reduce)} data-testid="no-votes-card" className="flex max-w-xl flex-col items-center gap-4 text-center">
      <span className="bg-fg/6 text-fg-muted grid size-16 place-items-center rounded-full">
        <HandCoins className="size-8" strokeWidth={1.5} aria-hidden />
      </span>
      <h3 className="text-display text-fg">No votes</h3>
      <p className="text-title-3 text-fg-muted">
        {refund > 0n ? (
          <>
            The prize of{" "}
            <span className="text-prize-text tabular">
              {formatEth(refund)} {currencyLabel}
            </span>{" "}
            goes back to the organiser.
          </>
        ) : (
          "Nobody voted, so there's no winner this time."
        )}
      </p>
    </motion.article>
  );
}

