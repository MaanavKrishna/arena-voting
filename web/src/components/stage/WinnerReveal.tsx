"use client";

import { Gavel, RotateCcw } from "lucide-react";
import { motion } from "motion/react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { useConnection } from "wagmi";
import { entryName, resultsModel } from "@/components/contest/contestLogic";
import { NumberTicker } from "@/components/fx/NumberTicker";
import { Button } from "@/components/ui/Button";
import { Hemicycle } from "@/components/ui/Hemicycle";
import { TxButton, type TxButtonProps } from "@/components/wallet/TxButton";
import { isE2E } from "@/config/network";
import { useArenaWrite } from "@/hooks/useArenaWrite";
import { useContest } from "@/hooks/useContest";
import { useEntries, type EntryWithMetadata } from "@/hooks/useEntries";
import { parseContestId } from "@/hooks/shared";
import { fade } from "@/lib/motion";
import { RevealSequence, type RevealEntry, type RevealModel } from "./RevealSequence";
import { effectivePhase, parseRevealPreview, revealOutcome, type RevealOutcome, type RevealPreview } from "./reveal";

/**
 * `?preview=reveal` (or `closed`) on the Stage, honoured only in E2E mode (`isE2E`): shows the
 * ended states with the current live tallies, without finalising anything on chain.
 */
export function useRevealPreview(): RevealPreview {
  const params = useSearchParams();
  return parseRevealPreview(params.get("preview"), isE2E);
}

/** Stage panel once voting has ended: "Voting closed" + Finalise, then the winner reveal. */
export function WinnerReveal({ contestId }: { contestId: string }) {
  const preview = useRevealPreview();
  const id = parseContestId(contestId);
  const contest = useContest(contestId);
  const entries = useEntries(contestId);
  const finalize = useArenaWrite("finalize");
  const { address } = useConnection();
  const view = contest.data;

  const phase = effectivePhase(contest.phase, preview);
  const outcome = revealOutcome({ phase, entries: entries.data, prize: view?.prize ?? 0n });
  const organiser = !!address && !!view && address.toLowerCase() === view.organiser.toLowerCase();

  const onFinalize = async () => {
    if (id === undefined) return;
    const hash = await finalize.write({ args: [id] });
    if (hash) void Promise.all([contest.refetch(), entries.refetch()]);
  };

  if (!view || !entries.data) return null;
  return (
    <RevealPanel
      outcome={outcome}
      entries={entries.data}
      finalize={finalize}
      onFinalize={() => void onFinalize()}
      canReplay={organiser || preview !== null}
    />
  );
}

/** Reveal entries from the hook's rows (name resolved, image URI from metadata). */
export function toRevealEntries(list: readonly EntryWithMetadata[]): RevealEntry[] {
  return list.map((e) => ({ id: e.id, votes: e.votes, removed: e.removed, name: entryName(e), image: e.metadata.image }));
}

export type RevealPanelProps = {
  outcome: RevealOutcome;
  entries: readonly EntryWithMetadata[];
  finalize: TxButtonProps["action"];
  onFinalize: () => void;
  /** Organiser (or a preview) gets the Replay control. */
  canReplay: boolean;
};

/** Presentational: picks the closed panel or the reveal for an outcome. Tested with mocked data. */
export function RevealPanel({ outcome, entries, finalize, onFinalize, canReplay }: RevealPanelProps) {
  const [run, setRun] = useState(0);
  const model = useMemo(() => {
    const m = resultsModel(entries);
    const names = new Map(entries.map((e) => [e.id, entryName(e)] as const));
    return { ...m, names };
  }, [entries]);
  const reveal = useMemo(() => toRevealEntries(entries), [entries]);

  if (outcome.kind === "live") return null;
  if (outcome.kind === "closed") return <VotingClosed model={model} finalize={finalize} onFinalize={onFinalize} />;

  const replay = canReplay ? (
    <Button
      variant="ghost"
      size="sm"
      className="rounded-full"
      icon={<RotateCcw className="size-4" strokeWidth={1.75} aria-hidden />}
      onClick={() => setRun((r) => r + 1)}
    >
      Replay
    </Button>
  ) : null;

  return <RevealSequence key={run} outcome={outcome} entries={reveal} model={model} actions={replay} />;
}

function VotingClosed({
  model,
  finalize,
  onFinalize,
}: {
  model: RevealModel & { names: ReadonlyMap<number, string> };
  finalize: TxButtonProps["action"];
  onFinalize: () => void;
}): ReactNode {
  return (
    <motion.div
      className="relative flex h-full min-h-0 flex-col p-6 md:p-8"
      data-reveal-kind="closed"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={fade}
    >
      <h2 className="text-title-2 text-fg">Voting closed</h2>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 pt-2 md:gap-8">
        <div className="flex min-h-0 w-full flex-1 items-center justify-center opacity-60">
          <Hemicycle
            className="aspect-[11/6] max-h-full w-full max-w-2xl lg:h-full lg:w-auto"
            counts={model.counts}
            colours={model.colours}
            names={model.names}
          >
            <span className="text-numeric-xl text-fg tabular">
              <NumberTicker value={model.total} />
            </span>
            <span className="text-callout text-fg-muted">{model.total === 1 ? "vote" : "votes"}</span>
          </Hemicycle>
        </div>
        <div className="flex w-full max-w-md shrink-0 flex-col items-center gap-3 text-center">
          <p className="text-title-3 text-fg">The votes are in.</p>
          <p className="text-callout text-fg-muted">
            Anyone can finalise. The contract counts the votes, sets the prize aside and the winner appears here.
          </p>
          <TxButton action={finalize} onClick={onFinalize} size="lg" fullWidth confirmedLabel="Finalised">
            <Gavel className="size-5" strokeWidth={1.75} aria-hidden />
            Finalise and reveal
          </TxButton>
        </div>
      </div>
    </motion.div>
  );
}
