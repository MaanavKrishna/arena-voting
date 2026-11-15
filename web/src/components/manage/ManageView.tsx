"use client";

import { ArrowUpRight, LockKeyhole } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useConnection } from "wagmi";
import { LinkButton } from "@/components/landing/LinkButton";
import { BentoGrid } from "@/components/ui/BentoGrid";
import { Badge } from "@/components/ui/Badge";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatusPill, type Status } from "@/components/ui/StatusPill";
import { parseContestId } from "@/hooks/shared";
import { useArena } from "@/hooks/useArena";
import { useChainTime } from "@/hooks/useChainTime";
import { useContest } from "@/hooks/useContest";
import { useEntries } from "@/hooks/useEntries";
import { useLogs } from "@/hooks/useLogs";
import type { Phase } from "@/lib/phase";
import { buildChecklist } from "./checklist";
import { ChecklistCard } from "./ChecklistCard";
import { EntriesAdmin } from "./EntriesAdmin";
import { FundStageCard } from "./FundStageCard";
import { GatekeepersCard } from "./GatekeepersCard";
import { reduceGatekeepers, type GatekeeperLog } from "./gatekeepers";
import { BackLink, ContestNotFoundNotice, PageContainer, PageNotice, PageSkeleton } from "./pageBits";
import { PRESENCE_LABEL, presenceOf } from "./presence";
import { ShareCard } from "./ShareCard";
import { StatsCard } from "./StatsCard";
import { TicketListCard } from "./TicketListCard";
import { useSharedFlag } from "./useSharedFlag";

const REFRESH_MS = 8_000;

const PHASE_PILL: Record<Phase, { status: Status; label: string }> = {
  submissions: { status: "upcoming", label: "Taking entries" },
  upcoming: { status: "upcoming", label: "Voting soon" },
  voting: { status: "live", label: "Voting live" },
  ended: { status: "ended", label: "Voting ended" },
  finalized: { status: "ended", label: "Finished" },
};

/** `/c/[id]/manage`: the organiser's control room. */
export function ManageView({ contestId }: { contestId: string }) {
  const id = parseContestId(contestId);
  const { chainId } = useArena();
  const contest = useContest(id);
  const entries = useEntries(id);
  const { now } = useChainTime();
  const { address: account, status } = useConnection();
  const [shared, markShared] = useSharedFlag(`arena:shared:${chainId}:${contestId}`);

  const presence = contest.data ? presenceOf(contest.data.presence) : "Anywhere";
  const isOrganiser = !!account && !!contest.data && account.toLowerCase() === contest.data.organiser.toLowerCase();
  const gateLogs = useLogs("GatekeeperSet", id === undefined ? undefined : { contestId: id }, {
    enabled: isOrganiser && presence === "Gated" && id !== undefined,
  });
  const gates = useMemo(() => reduceGatekeepers((gateLogs.data ?? []) as unknown as GatekeeperLog[]), [gateLogs.data]);

  // Keep the live numbers fresh while the organiser watches.
  const refetchContest = contest.refetch;
  const refetchEntries = entries.refetch;
  useEffect(() => {
    if (!isOrganiser) return;
    const t = setInterval(() => {
      if (document.hidden) return;
      void refetchContest();
      void refetchEntries();
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [isOrganiser, refetchContest, refetchEntries]);

  if (id === undefined) return <ContestNotFoundNotice />;
  if (contest.notDeployed) {
    return (
      <PageContainer>
        <ErrorState title="Arena isn't available on this network yet." description="Switch to the network this app targets, or check back soon." />
      </PageContainer>
    );
  }
  if (contest.isPending || status === "connecting" || status === "reconnecting") return <PageSkeleton />;
  if (!contest.data) return <ContestNotFoundNotice isError={contest.isError} onRetry={() => void contest.refetch()} />;

  const c = contest.data;
  if (!account) {
    return (
      <PageNotice
        contestId={contestId}
        icon={<LockKeyhole strokeWidth={1.75} />}
        title="Connect the organiser's wallet"
        description="The control room is for whoever created this contest. Connect that wallet to continue."
      />
    );
  }
  if (!isOrganiser) {
    return (
      <PageNotice
        contestId={contestId}
        icon={<LockKeyhole strokeWidth={1.75} />}
        title="This is the organiser's page"
        description="Only the wallet that created this contest can manage it. You can still see the contest and vote in it."
      />
    );
  }

  const ended = contest.phase === "ended" || contest.phase === "finalized";
  const pill = contest.phase ? PHASE_PILL[contest.phase] : null;
  const checklist = buildChecklist({
    presence,
    liveEntryCount: c.liveEntryCount,
    beaconRotation: c.beaconRotation,
    activeGatekeepers: presence === "Gated" ? (gateLogs.isPending ? undefined : gates.active.length) : undefined,
    shared,
  });

  return (
    <PageContainer>
      <BackLink href={`/c/${contestId}`}>Back to the contest</BackLink>
      <header className="mt-4 mb-8 flex flex-col gap-4 md:mb-10 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="text-caption-caps text-fg-muted mb-2">Control room</p>
          <h1 className="text-display text-fg text-balance">{c.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {pill ? <StatusPill status={pill.status} label={pill.label} /> : null}
            <Badge tone="neutral">{PRESENCE_LABEL[presence].name}</Badge>
            <Badge tone="neutral">{c.openSubmissions ? "Open entries" : "Curated entries"}</Badge>
          </div>
        </div>
        <LinkButton href={`/c/${contestId}`} variant="secondary" iconAfter={<ArrowUpRight className="size-5" strokeWidth={1.75} aria-hidden />}>
          View contest
        </LinkButton>
      </header>

      <BentoGrid className="auto-rows-auto">
        <ChecklistCard contestId={contestId} items={checklist} />
        <StatsCard contest={c} now={now} ended={ended} />
        <ShareCard contestId={contestId} title={c.title} onShared={markShared} />
        <EntriesAdmin
          contestId={id}
          contest={c}
          phase={contest.phase}
          entries={entries.data}
          isPending={entries.isPending}
          isError={entries.isError}
          onRetry={() => void entries.refetch()}
        />
        <TicketListCard contestId={id} contest={c} phase={contest.phase} />
        {presence === "Gated" ? (
          <GatekeepersCard
            contestId={id}
            gates={gates}
            isLoading={gateLogs.isPending}
            dripPerCheckIn={c.dripPerCheckIn}
            votingEnded={ended}
          />
        ) : null}
        {presence === "Gated" ? <FundStageCard span={1} /> : presence === "Room" ? <FundStageCard span={3} /> : null}
      </BentoGrid>
    </PageContainer>
  );
}

