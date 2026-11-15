"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Inbox } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConnection } from "wagmi";
import { VoteBeam, type Point } from "@/components/fx/hero/VoteBeam";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { colourVar, type HemicycleHandle } from "@/components/ui/Hemicycle";
import { useReducedMotionPref } from "@/components/ui/hooks";
import type { RankedRow } from "@/components/ui/RankedList";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { chainName } from "@/config/network";
import { arenaKeys, parseContestId } from "@/hooks/shared";
import type { ContestView } from "@/hooks/types";
import { useArena } from "@/hooks/useArena";
import { useArenaWrite } from "@/hooks/useArenaWrite";
import { useChainTime } from "@/hooks/useChainTime";
import { useContest } from "@/hooks/useContest";
import { useEntries } from "@/hooks/useEntries";
import { useLiveContest } from "@/hooks/useLiveContest";
import { useTicketList } from "@/hooks/useTicketList";
import { useVoterState } from "@/hooks/useVoterState";
import type { Phase } from "@/lib/phase";
import { ClaimCard, FinalizeCard } from "./ActionCards";
import { ContestFrame, ContestNotFound, ContestSkeleton, NotDeployed } from "./ContestStates";
import { ContestHeader } from "./ContestHeader";
import { EntryCard, type EntryVoteState } from "./EntryCard";
import { EntrySheet } from "./EntrySheet";
import { PresenceSlot } from "./PresenceSlot";
import { ResultsPanel } from "./ResultsPanel";
import { useClaimable } from "./useClaimable";
import {
  PRESENCE_ANYWHERE,
  createResultsMemory,
  entryName,
  isContestNotFound,
  isOwnEntry,
  liveEntries,
  rankEntries,
  shareOf,
  voteArgs,
  voteBlockReason,
  winnersOf,
} from "./contestLogic";

/** Contest page client island: picks the state (not deployed / not found / loading / error / loaded). */
export function ContestPage({ id }: { id: string }) {
  const { deployed } = useArena();
  const contest = useContest(id);
  const { now } = useChainTime();

  if (!deployed) return <NotDeployed chainName={chainName} />;
  if (contest.isError && isContestNotFound(contest.error)) return <ContestNotFound />;
  if (contest.isError) {
    return (
      <ContestFrame>
        <ErrorState
          className="py-24"
          title="We couldn't load this contest."
          description="Check your connection and try again."
          onRetry={() => void contest.refetch()}
        />
      </ContestFrame>
    );
  }
  if (!contest.data) return <ContestSkeleton />;
  return <ContestScreen contest={contest.data} phase={contest.phase} now={now} />;
}

type Beam = { entryId: number; minVotes: number; from: Point; to: Point | null };

const clampToViewport = (p: Point): Point => ({
  x: Math.min(Math.max(p.x, 16), window.innerWidth - 16),
  y: Math.min(Math.max(p.y, 16), window.innerHeight - 16),
});

function cardCentre(entryId: number): Point {
  const card = document.querySelector(`[data-entry-card="${entryId}"]`);
  const r = card?.getBoundingClientRect();
  return clampToViewport(r ? { x: r.left + r.width / 2, y: r.top + r.height * 0.4 } : { x: window.innerWidth / 2, y: window.innerHeight });
}

function inViewport(el: Element | null | undefined): boolean {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.top >= 0 && r.bottom <= window.innerHeight;
}

function ContestScreen({ contest, phase, now }: { contest: ContestView; phase: Phase | undefined; now: bigint }) {
  const contestId = contest.id;
  const id = contestId.toString();
  const { chainId } = useArena();
  const entries = useEntries(id);
  const voter = useVoterState(id);
  useLiveContest(id);
  const tickets = useTicketList(id);
  const claim = useClaimable(parseContestId(id));
  const { address: account } = useConnection();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const reduce = useReducedMotionPref();

  const vote = useArenaWrite("vote");
  const finalize = useArenaWrite("finalize");
  const withdraw = useArenaWrite("withdraw");

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: arenaKeys.contest(chainId, contestId) }),
    [queryClient, chainId, contestId],
  );

  // ---- results model ------------------------------------------------------------------------
  const list = useMemo(() => entries.data ?? [], [entries.data]);
  // Colours stay with an entry while it stays in the top 7 (sticky), so the model remembers the last assignment.
  const [stickyResults] = useState(createResultsMemory);
  const results = useMemo(() => stickyResults(list), [list, stickyResults]);

  const names = useMemo(() => new Map(list.map((e) => [e.id, entryName(e)])), [list]);
  const finalized = phase === "finalized";
  const winners = useMemo(() => (finalized ? winnersOf(list) : []), [finalized, list]);
  const [justVoted, setJustVoted] = useState<number | null>(null);
  const votedId = voter.data?.votedEntryId || justVoted || 0;

  const rows: RankedRow[] = useMemo(
    () =>
      rankEntries(list).map((e) => ({
        entryId: e.id,
        name: names.get(e.id) ?? `Entry ${e.id}`,
        votes: e.votes,
        rank: e.rank,
        colour: results.colours.get(e.id),
        winner: winners.includes(e.id),
        mine: votedId === e.id,
      })),
    [list, names, results.colours, winners, votedId],
  );

  // ---- entry sheet ---------------------------------------------------------------------------
  const [selected, setSelected] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const selectedEntry = list.find((e) => e.id === selected) ?? null;
  const [voteTarget, setVoteTarget] = useState<number | null>(null);

  const openEntry = (entryId: number) => {
    if (vote.status === "error" || vote.status === "confirmed") vote.reset();
    setSelected(entryId);
    setSheetOpen(true);
  };

  // Once the wallet has said yes, the sheet gets out of the way and the card shows "Sending…".
  // If the network then refuses the vote, the sheet comes back with the reason.
  const sheetVisible =
    sheetOpen && selectedEntry !== null && !(voteTarget === selected && (vote.status === "pending" || vote.status === "confirmed"));

  // A failure while the sheet is closed still needs saying.
  useEffect(() => {
    if (vote.status === "error" && !sheetVisible && vote.error) {
      toast({ tone: "error", title: vote.error.title, description: vote.error.detail });
    }
  }, [vote.status, vote.error, sheetVisible, toast]);

  // ---- vote ------------------------------------------------------------------------------------
  const [beam, setBeam] = useState<Beam | null>(null);
  const hemicycle = useRef<HemicycleHandle>(null);
  const votesOf = useCallback((entryId: number) => list.find((e) => e.id === entryId)?.votes ?? 0, [list]);

  const onVote = async () => {
    if (selected === null) return;
    const entryId = selected;
    setVoteTarget(entryId);
    const proof = tickets.hasList ? (account ? tickets.proofFor(account) : null) : [];
    const before = votesOf(entryId);
    const hash = await vote.write({ args: voteArgs(contestId, entryId, proof) });
    if (!hash) return;
    navigator.vibrate?.(10);
    setJustVoted(entryId);
    setSheetOpen(false);
    setBeam({ entryId, minVotes: before + 1, from: cardCentre(entryId), to: null });
    void refresh();
  };

  // When the new seat exists, bring the hemicycle into view and fly the beam to it.
  const seatReady = beam !== null && votesOf(beam.entryId) >= beam.minVotes;
  useEffect(() => {
    if (!beam || beam.to || !seatReady) return;
    const el = hemicycle.current?.element();
    const visible = inViewport(el);
    if (!visible) el?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    const t = setTimeout(
      () => {
        const to = hemicycle.current?.pointFor(beam.entryId);
        setBeam((b) => (b && to ? { ...b, from: cardCentre(b.entryId), to } : null));
      },
      visible || reduce ? 30 : 450,
    );
    return () => clearTimeout(t);
  }, [beam, seatReady, reduce]);

  // Never leave a seat held if the refresh doesn't arrive.
  useEffect(() => {
    if (!beam) return;
    const t = setTimeout(() => setBeam(null), 12_000);
    return () => clearTimeout(t);
  }, [beam]);

  // ---- finalise / claim ----------------------------------------------------------------------
  const onFinalize = async () => {
    const hash = await finalize.write({ args: [contestId] });
    if (hash) {
      toast({ tone: "success", title: "Results finalised", description: "The prize is set aside for the winner." });
      void refresh();
    }
  };
  const onClaim = async () => {
    const hash = await withdraw.write();
    if (hash) {
      toast({ tone: "success", title: "Sent to your wallet" });
      void refresh();
    }
  };

  const lower = (a?: string) => a?.toLowerCase();
  const isOrganiser = !!account && lower(account) === lower(contest.organiser);
  const winsPrize =
    !!account && list.some((e) => winners.includes(e.id) && lower(e.payee) === lower(account));
  const showClaim = finalized && !!claim.amount && claim.amount > 0n && (winsPrize || isOrganiser);

  // ---- derived UI state ------------------------------------------------------------------------
  const live = liveEntries(list);
  const votingOpen = phase === "voting";
  const anywhere = contest.presence === PRESENCE_ANYWHERE;
  const onList = account ? tickets.proofFor(account) !== null : false;

  const disabledReason = selectedEntry
    ? voteBlockReason({
        phase,
        presence: contest.presence,
        presenceReady: anywhere, // Ground replaces PresenceSlot and supplies readiness + beacon token
        votedEntryId: votedId,
        ownEntry: isOwnEntry(selectedEntry, account, contest.organiser),
        removed: selectedEntry.removed,
        ticket: { hasList: tickets.hasList, loading: tickets.isPending, onList, failed: tickets.isError },
        connected: !!account,
      })
    : null;

  const cardState = (entryId: number): EntryVoteState => {
    if (voteTarget === entryId && vote.status === "confirm-in-wallet") return "confirm";
    if (voteTarget === entryId && vote.status === "pending") return "sending";
    return votedId === entryId ? "voted" : "idle";
  };

  const galleryNote =
    phase === "voting"
      ? votedId
        ? "Your vote is in. Results update live."
        : "Tap an entry to see it and vote. One vote per wallet."
      : phase === "submissions"
        ? "Entries are still coming in."
        : phase === "upcoming"
          ? "Voting opens when the countdown ends."
          : "Voting has closed.";

  const votedName = votedId ? (names.get(votedId) ?? `Entry ${votedId}`) : null;

  return (
    <ContestFrame>
      <ContestHeader contest={contest} phase={phase} now={now} />

      <div className="mt-8 grid gap-6 md:mt-10 lg:grid-cols-[minmax(0,1fr)_25rem] lg:grid-rows-[auto_1fr] lg:gap-x-10 lg:gap-y-8">
        {/* Action area: what this visitor can do right now. */}
        <div className="flex flex-col gap-4 empty:hidden lg:col-start-1 lg:row-start-1">
          <div aria-live="polite" className="empty:hidden">
            {votedName ? (
              <div className="bg-verified/10 border-verified/25 flex items-center gap-3 rounded-md border px-4 py-3">
                <CheckCircle2 className="text-verified-text size-5 shrink-0" strokeWidth={1.75} aria-hidden />
                <p className="text-callout text-fg">
                  You voted for <span className="font-semibold">{votedName}</span>
                  <span className="text-fg-muted"> · Your vote is final and public.</span>
                </p>
              </div>
            ) : null}
          </div>
          {votingOpen && !anywhere && !votedId ? <PresenceSlot contestId={contestId} presence={contest.presence} /> : null}
          {phase === "ended" ? <FinalizeCard action={finalize} onFinalize={onFinalize} /> : null}
          {showClaim && claim.amount ? (
            <ClaimCard amount={claim.amount} action={withdraw} onClaim={onClaim} refund={!winsPrize} />
          ) : null}
        </div>

        <aside className="lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <ResultsPanel
            ref={hemicycle}
            phase={phase}
            rows={rows}
            counts={results.counts}
            colours={results.colours}
            names={names}
            total={results.total}
            winners={winners}
            share={shareOf(contest.prize, winners.length)}
            holdEntry={seatReady && beam ? beam.entryId : null}
            onSelect={openEntry}
          />
        </aside>

        <section aria-labelledby="entries-title" className="lg:col-start-1 lg:row-start-2">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 id="entries-title" className="text-title-2 text-fg">
              Entries
              {live.length ? (
                <span className="text-fg-muted tabular ml-2 font-normal">
                  <span className="sr-only">, </span>
                  {live.length}
                </span>
              ) : null}
            </h2>
          </div>
          <p className="text-callout text-fg-muted -mt-2 mb-5">{galleryNote}</p>
          {entries.isError ? (
            <ErrorState
              title="We couldn't load the entries."
              onRetry={() => void entries.refetch()}
            />
          ) : !entries.data ? (
            <div className="grid-gallery">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : live.length === 0 ? (
            <EmptyState
              className="solid squircle rounded-md"
              icon={<Inbox strokeWidth={1.75} aria-hidden />}
              title="No entries yet"
              description={
                phase === "submissions"
                  ? "Entries show up here as soon as they're submitted."
                  : "This contest closed without any entries."
              }
            />
          ) : (
            <div className="grid-gallery">
              {live.map((e) => (
                <EntryCard
                  key={e.id}
                  entryId={e.id}
                  name={names.get(e.id) ?? `Entry ${e.id}`}
                  tagline={e.metadataStatus === "ready" ? e.metadata.tagline : ""}
                  image={e.metadataStatus === "ready" ? e.metadata.image : undefined}
                  loading={e.metadataStatus === "loading"}
                  votes={e.votes}
                  color={colourVar(results.colours.get(e.id))}
                  voteState={cardState(e.id)}
                  winner={winners.includes(e.id)}
                  onOpen={() => openEntry(e.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <EntrySheet
        entry={selectedEntry}
        name={selectedEntry ? (names.get(selectedEntry.id) ?? `Entry ${selectedEntry.id}`) : ""}
        color={colourVar(selectedEntry ? results.colours.get(selectedEntry.id) : undefined)}
        open={sheetVisible}
        onOpenChange={setSheetOpen}
        contestId={contestId}
        presence={contest.presence}
        votingOpen={votingOpen}
        votedForThis={selectedEntry !== null && votedId === selectedEntry.id}
        winner={selectedEntry !== null && winners.includes(selectedEntry.id)}
        action={voteTarget === selected ? vote : { status: "idle", isBusy: false, error: null }}
        onVote={() => void onVote()}
        disabledReason={disabledReason}
        closedNote={
          phase === "submissions" || phase === "upcoming"
            ? "Voting opens when the countdown ends."
            : "Voting has closed for this contest."
        }
      />

      {beam?.to ? (
        <VoteBeam
          from={beam.from}
          to={beam.to}
          color={colourVar(results.colours.get(beam.entryId))}
          onDone={() => setBeam(null)}
        />
      ) : null}
    </ContestFrame>
  );
}
