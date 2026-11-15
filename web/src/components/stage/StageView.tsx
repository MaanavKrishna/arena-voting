"use client";

import { SlidersHorizontal } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Aurora } from "@/components/fx/hero/Aurora";
import { BorderBeam } from "@/components/fx/hero/BorderBeam";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { cn } from "@/components/ui/cn";
import { PRESENCE_ANYWHERE, PRESENCE_GATED, isContestNotFound } from "@/components/contest/contestLogic";
import { isE2E } from "@/config/network";
import { useArena } from "@/hooks/useArena";
import { useChainTime } from "@/hooks/useChainTime";
import { useContest } from "@/hooks/useContest";
import { useEntries } from "@/hooks/useEntries";
import { useLiveContest } from "@/hooks/useLiveContest";
import { parseContestId } from "@/hooks/shared";
import { useStageBeacon } from "@/hooks/useStageBeacon";
import { relativeTime } from "@/lib/format";
import { BeaconSetup } from "./BeaconSetup";
import { BeaconStatusBar } from "./BeaconStatusBar";
import { JoinPanel } from "./JoinPanel";
import { StageControls } from "./StageControls";
import { StageResults } from "./StageResults";
import { StageEmpty, StageError, StageSkeleton } from "./StageStates";
import { StartBeacon } from "./StartBeacon";
import { useBeaconController } from "./useBeaconController";
import { useStageBurner } from "./useStageBurner";
import { useTransmitter } from "./useTransmitter";
import { useAutoStop } from "./useAutoStop";
import { WinnerReveal, useRevealPreview } from "./WinnerReveal";

const defaultReveal = (contestId: string) => <WinnerReveal contestId={contestId} />;

export type StageViewProps = {
  contestId: string;
  /**
   * Replaces the live results once voting has ended (default: the winner reveal). With the E2E flag
   * on, `?preview=reveal|closed` shows it early with the live tallies, without touching the chain.
   */
  renderReveal?: (contestId: string) => ReactNode;
};

/**
 * The projector view and beacon controller (Task 14). Always dark (kiosk layout), designed for
 * 1440+ wide screens: live hemicycle + top 5 on the left, join QR + counters on the right, beacon
 * status along the bottom. Organiser controls live in a drawer so the projected view stays clean.
 */
export function StageView({ contestId, renderReveal = defaultReveal }: StageViewProps) {
  const id = parseContestId(contestId);
  const { chainId, address: arena } = useArena();
  const contest = useContest(contestId);
  const entries = useEntries(contestId);
  useLiveContest(contestId);
  const time = useChainTime();
  const view = contest.data;
  const preview = useRevealPreview();

  const controller = useBeaconController({ contest: view, chainNow: time.now, ids: { chainId, arena, contestId: id } });
  const active = controller.active;
  const beacon = useStageBeacon({
    contestId: id,
    chain: active?.chain ?? null,
    start: active?.start ?? 0n,
    length: active?.length ?? 0,
  });
  const transmitter = useTransmitter(beacon.payload);
  const [advanceOn, setAdvanceOn] = useState(true);
  const [controlsOpen, setControlsOpen] = useState(false);

  const phase = contest.phase;
  const voting = phase === "voting";
  useAutoStop(phase === "ended" || phase === "finalized", transmitter.status, transmitter.stop);
  const burner = useStageBurner({
    contestId: id,
    chain: active?.chain ?? null,
    onChain: controller.onChain,
    slot: beacon.slot,
    enabled: advanceOn && voting && active !== null && view?.presence !== PRESENCE_ANYWHERE,
  });

  if (id === undefined) return <StageEmpty title="That contest doesn't exist." />;
  if (contest.notDeployed) return <StageEmpty title="Arena isn't available on this network yet." />;
  if (contest.isError) {
    return isContestNotFound(contest.error) ? (
      <StageEmpty title="That contest doesn't exist." />
    ) : (
      <StageError onRetry={() => void contest.refetch()} />
    );
  }
  if (!view) return <StageSkeleton />;

  const needsBeacon = view.presence !== PRESENCE_ANYWHERE;
  // A reveal preview (E2E only) behaves like the real ended state: no beacon setup, closed pill.
  const ended = phase === "ended" || phase === "finalized" || preview !== null;
  const flow = controller.flow;
  const setupOpen =
    needsBeacon &&
    !ended &&
    (flow.kind === "sign" ||
      flow.kind === "signing" ||
      flow.kind === "building" ||
      flow.kind === "backup-required" ||
      flow.kind === "publish" ||
      flow.kind === "mismatch" ||
      flow.kind === "error");
  const canStart = needsBeacon && active !== null && !ended && transmitter.status !== "on" && !setupOpen;

  const statusPill = ended ? (
    <StatusPill status="ended" label={phase === "finalized" || preview === "reveal" ? "Final results" : "Voting closed"} />
  ) : voting ? (
    <StatusPill status="live" label="Voting live" />
  ) : (
    <StatusPill status="upcoming" label={time.now > 0n ? `Voting opens ${relativeTime(view.votingStart, time.now)}` : "Upcoming"} />
  );

  return (
    <div
      className="relative flex min-h-dvh flex-col gap-5 px-5 py-5 md:gap-6 md:px-10 md:py-8 lg:h-dvh lg:min-h-0"
      data-stage-root=""
      data-flow={flow.kind}
      {...(isE2E && beacon.payloadHex ? { "data-beacon-payload": beacon.payloadHex } : {})}
    >
      {/* Ambient: Aurora before voting opens; the live panel carries BorderBeam instead (never both). */}
      {!voting && !ended ? <Aurora className="-z-10" intensity={0.3} /> : null}

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-caption-caps text-fg-subtle">Arena · Stage</p>
          <h1 className="text-display text-fg mt-1 max-w-4xl truncate">{view.title}</h1>
        </div>
        <div className="flex items-center gap-3">
          {statusPill}
          <Button
            variant="secondary"
            size="sm"
            className="rounded-full"
            icon={<SlidersHorizontal className="size-4" strokeWidth={1.75} aria-hidden />}
            onClick={() => setControlsOpen(true)}
          >
            Controls
          </Button>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-5 md:gap-6 lg:grid-cols-12">
        <section
          aria-label="Live results"
          className="solid squircle relative flex min-h-0 flex-col overflow-hidden rounded-xl lg:col-span-7"
        >
          {voting && !ended ? <BorderBeam /> : null}
          {ended && renderReveal ? (
            renderReveal(contestId)
          ) : (
            <StageResults entries={entries.data} loading={entries.isPending} phase={phase} />
          )}
        </section>
        <JoinPanel
          className="lg:col-span-5"
          contestId={contestId}
          votes={view.totalVotes}
          checkedIn={view.presence === PRESENCE_GATED ? view.checkedInCount : null}
        />
      </main>

      {needsBeacon ? (
        <BeaconStatusBar
          beacon={beacon}
          active={active}
          onChain={controller.onChain}
          flow={flow}
          transmitter={transmitter}
          burner={burner}
          ended={ended}
          onOpenControls={() => setControlsOpen(true)}
        />
      ) : null}

      {canStart ? <StartBeacon transmitter={transmitter} beacon={beacon} /> : null}

      {setupOpen ? <BeaconSetup controller={controller} contestId={id} /> : null}

      <StageControls
        open={controlsOpen}
        onOpenChange={setControlsOpen}
        contestId={contestId}
        needsBeacon={needsBeacon}
        controller={controller}
        transmitter={transmitter}
        burner={burner}
        advanceOn={advanceOn}
        onAdvanceChange={setAdvanceOn}
        ended={ended}
      />
      <span className={cn("sr-only")} aria-live="polite">
        {transmitter.status === "on" ? "Beacon on." : ""}
      </span>
    </div>
  );
}
