"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Gift, LockKeyhole, Trophy, Vote, DoorOpen, PartyPopper } from "lucide-react";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { useConnection } from "wagmi";
import { ClaimCard } from "@/components/contest/ActionCards";
import { statusOf } from "@/components/contest/ContestCard";
import { PageContainer, PageSkeleton } from "@/components/manage/pageBits";
import { LinkButton } from "@/components/landing/LinkButton";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusPill } from "@/components/ui/StatusPill";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { useConnectLauncher } from "@/components/wallet/ConnectSheet";
import { chainName } from "@/config/network";
import { arenaAbi } from "@/generated";
import { useArena } from "@/hooks/useArena";
import { useArenaWrite } from "@/hooks/useArenaWrite";
import { useChainTime } from "@/hooks/useChainTime";
import { useContests } from "@/hooks/useContests";
import { useLogs } from "@/hooks/useLogs";
import { useMetadata } from "@/hooks/useMetadata";
import { arenaKeys, retryUnlessRevert } from "@/hooks/shared";
import type { ContestView } from "@/hooks/types";
import { phaseOf } from "@/lib/phase";
import { UNTITLED_ENTRY } from "@/lib/metadata";
import { entryKey, entryRole, entryUriIndex, newestFirst, uniqueContestIds } from "./activity";

/** `/me`: everything the connected wallet has done in Arena, from on-chain events. */
export function MyActivity() {
  const { deployed } = useArena();
  const { address: account, status } = useConnection();
  const { openConnect, sheet } = useConnectLauncher();

  if (!deployed) {
    return (
      <PageContainer narrow>
        <ErrorState title="Arena isn't available on this network yet." description="Switch to the network this app targets, or check back soon." />
      </PageContainer>
    );
  }
  if (status === "connecting" || status === "reconnecting") return <PageSkeleton narrow />;
  if (!account) {
    return (
      <PageContainer narrow>
        <Card padding="lg" className="mx-auto max-w-xl">
          <EmptyState
            icon={<LockKeyhole strokeWidth={1.75} aria-hidden />}
            title="Connect to see your activity"
            description="Your contests, entries, votes and prizes are read from the blockchain for the wallet you connect. Nothing is stored about you."
            action={<Button onClick={() => openConnect()}>Connect wallet</Button>}
          />
        </Card>
        {sheet}
      </PageContainer>
    );
  }
  return <Activity account={account} />;
}

function Activity({ account }: { account: `0x${string}` }) {
  const contests = useContests();
  const byId = useMemo(() => new Map((contests.all ?? []).map((c) => [c.id.toString(), c])), [contests.all]);

  return (
    <PageContainer narrow>
      <header className="mb-8 md:mb-10">
        <h1 className="text-display text-fg">My activity</h1>
        <p className="text-body text-fg-muted mt-2 text-pretty">
          What this wallet has created, entered, voted for and won on {chainName}.
        </p>
      </header>
      <div className="flex flex-col gap-10">
        <Prizes account={account} />
        <Created account={account} contests={byId} />
        <Entries account={account} contests={byId} />
        <Votes account={account} contests={byId} />
        <CheckIns account={account} contests={byId} />
      </div>
    </PageContainer>
  );
}

/* ---------------------------------------------------------------- shared bits */

type Lookup = ReadonlyMap<string, ContestView>;

function Section({
  title,
  hint,
  icon,
  children,
}: {
  title: string;
  hint?: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="bg-fg/5 text-fg-muted grid size-9 shrink-0 place-items-center rounded-full [&_svg]:size-4.5">{icon}</span>
        <div className="min-w-0">
          <h2 className="text-title-3 text-fg">{title}</h2>
          {hint ? <p className="text-footnote text-fg-muted mt-0.5">{hint}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

/** Loading, error, empty or the list, so every section handles all four the same way. */
function ListBody({
  query,
  count,
  emptyTitle,
  emptyText,
  emptyAction,
  children,
}: {
  query: { isPending: boolean; isError: boolean; refetch: () => unknown };
  count: number;
  emptyTitle: string;
  emptyText: string;
  emptyAction?: ReactNode;
  children: ReactNode;
}) {
  if (query.isPending) {
    return (
      <div role="status" aria-label="Loading" className="solid squircle shadow-sm flex flex-col gap-3 rounded-md p-4">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <Card padding="sm">
        <ErrorState
          className="py-6"
          title="We couldn't load this."
          description="Check your connection and try again."
          onRetry={() => void query.refetch()}
        />
      </Card>
    );
  }
  if (count === 0) {
    return (
      <Card padding="sm">
        <EmptyState className="py-8" title={emptyTitle} description={emptyText} action={emptyAction} />
      </Card>
    );
  }
  return <ul className="solid squircle shadow-sm divide-fg/8 divide-y overflow-hidden rounded-md">{children}</ul>;
}

function Row({
  contestId,
  contests,
  detail,
  trailing,
}: {
  contestId: bigint;
  contests: Lookup;
  /** Under the title: what this wallet did. */
  detail?: ReactNode;
  trailing?: ReactNode;
}) {
  const { now } = useChainTime();
  const contest = contests.get(contestId.toString());
  const title = contest?.title ?? `Contest #${contestId}`;
  const pill = contest && now > 0n ? statusOf(phaseOf(contest, now)) : null;
  return (
    <li>
      <Link
        href={`/c/${contestId}`}
        className="hover:bg-fg/4 focus-visible:outline-accent flex min-h-16 items-center gap-3 px-4 py-3 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2"
      >
        <div className="min-w-0 flex-1">
          <p className="text-callout text-fg truncate font-medium">{title}</p>
          {detail ? <p className="text-footnote text-fg-muted mt-0.5 truncate">{detail}</p> : null}
        </div>
        {trailing}
        {pill ? <StatusPill status={pill.status} label={pill.label} className="hidden sm:inline-flex" /> : null}
        <ArrowRight className="text-fg-subtle size-4 shrink-0" strokeWidth={1.75} aria-hidden />
      </Link>
    </li>
  );
}

function EntryName({ uri, fallback }: { uri: string | undefined; fallback: string }) {
  const { data, status } = useMetadata(uri ?? "", "entry");
  if (!uri || status === "missing" || data === UNTITLED_ENTRY) return <>{fallback}</>;
  return <>{data.name || fallback}</>;
}

const browse = (
  <LinkButton href="/explore" variant="secondary">
    Explore contests
  </LinkButton>
);

/* ---------------------------------------------------------------- sections */

/** What Arena owes this wallet across all contests (`claimable`). */
function Prizes({ account }: { account: `0x${string}` }) {
  const { client, chainId, address } = useArena();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const withdraw = useArenaWrite("withdraw");

  const claimable = useQuery({
    queryKey: [...arenaKeys.root(chainId), "claimable", account.toLowerCase()],
    enabled: !!client && !!address,
    retry: retryUnlessRevert,
    queryFn: () => client!.readContract({ address: address!, abi: arenaAbi, functionName: "claimable", args: [account] }),
  });

  const onClaim = async () => {
    const hash = await withdraw.write();
    if (hash) {
      toast({ tone: "success", title: "Sent to your wallet" });
      await queryClient.invalidateQueries({ predicate: (q) => q.queryKey.includes("claimable") });
    }
  };

  const amount = claimable.data;
  return (
    <Section title="Prizes to claim" hint="Money Arena is holding for this wallet." icon={<Gift aria-hidden />}>
      {claimable.isPending ? (
        <div role="status" aria-label="Loading" className="solid squircle shadow-sm rounded-md p-4">
          <Skeleton className="h-5 w-1/2" />
        </div>
      ) : claimable.isError ? (
        <Card padding="sm">
          <ErrorState className="py-6" title="We couldn't check your prizes." onRetry={() => void claimable.refetch()} />
        </Card>
      ) : amount !== undefined && amount > 0n ? (
        <ClaimCard amount={amount} action={withdraw} onClaim={() => void onClaim()} />
      ) : (
        <Card padding="sm">
          <EmptyState
            className="py-8"
            title="Nothing to claim right now"
            description="When you win a prize, or get one back as an organiser, it shows up here once the contest is finalised."
          />
        </Card>
      )}
    </Section>
  );
}

type Account = { account: `0x${string}`; contests: Lookup };

function Created({ account, contests }: Account) {
  const logs = useLogs("ContestCreated", { organiser: account });
  const rows = useMemo(() => uniqueContestIds(newestFirst(logs.data ?? [])), [logs.data]);
  return (
    <Section title="Contests I created" hint="Open the control room from any of them." icon={<Trophy aria-hidden />}>
      <ListBody
        query={logs}
        count={rows.length}
        emptyTitle="You haven't created a contest"
        emptyText="Set one up in a couple of minutes: a name, a time, and an optional prize."
        emptyAction={<LinkButton href="/create">Create a contest</LinkButton>}
      >
        {rows.map((id) => (
          <Row key={id.toString()} contestId={id} contests={contests} detail="Organiser" />
        ))}
      </ListBody>
    </Section>
  );
}

function Entries({ account, contests }: Account) {
  const logs = useLogs("EntrySubmitted");
  const mine = useMemo(
    () => newestFirst(logs.data ?? []).filter((l) => entryRole(l.args, account) !== null),
    [logs.data, account],
  );
  return (
    <Section
      title="Entries I submitted or am paid for"
      hint="Where you're the submitter or the prize wallet."
      icon={<PartyPopper aria-hidden />}
    >
      <ListBody
        query={logs}
        count={mine.length}
        emptyTitle="No entries yet"
        emptyText="Entries you submit, or that name your wallet for the prize, appear here."
        emptyAction={browse}
      >
        {mine.map((l) => {
          const role = entryRole(l.args, account);
          const { contestId, entryId } = l.args;
          if (contestId === undefined || entryId === undefined) return null;
          return (
            <Row
              key={entryKey(contestId, entryId)}
              contestId={contestId}
              contests={contests}
              detail={
                <>
                  <EntryName uri={l.args.metadataURI} fallback={`Entry ${entryId}`} />
                  {" · "}
                  {role === "payee" ? "Paid for" : role === "both" ? "Submitted, paid to you" : "Submitted"}
                </>
              }
            />
          );
        })}
      </ListBody>
    </Section>
  );
}

function Votes({ account, contests }: Account) {
  const votes = useLogs("VoteCast", { voter: account });
  const entries = useLogs("EntrySubmitted");
  const uris = useMemo(() => entryUriIndex(entries.data ?? []), [entries.data]);
  const rows = useMemo(() => newestFirst(votes.data ?? []), [votes.data]);
  return (
    <Section title="My votes" hint="One vote per contest, and it's final." icon={<Vote aria-hidden />}>
      <ListBody
        query={votes}
        count={rows.length}
        emptyTitle="You haven't voted yet"
        emptyText="Find a contest that's live and back your favourite."
        emptyAction={browse}
      >
        {rows.map((l) => {
          const { contestId, entryId } = l.args;
          if (contestId === undefined || entryId === undefined) return null;
          return (
            <Row
              key={entryKey(contestId, entryId)}
              contestId={contestId}
              contests={contests}
              detail={
                <>
                  Voted for <EntryName uri={uris.get(entryKey(contestId, entryId))} fallback={`Entry ${entryId}`} />
                </>
              }
            />
          );
        })}
      </ListBody>
    </Section>
  );
}

function CheckIns({ account, contests }: Account) {
  const logs = useLogs("CheckedIn", { voter: account });
  const rows = useMemo(() => uniqueContestIds(newestFirst(logs.data ?? [])), [logs.data]);
  return (
    <Section title="My check-ins" hint="Contests where you got through the door." icon={<DoorOpen aria-hidden />}>
      <ListBody
        query={logs}
        count={rows.length}
        emptyTitle="No check-ins"
        emptyText="In contests with a door check-in, your pass is stamped here once you're in."
      >
        {rows.map((id) => (
          <Row
            key={id.toString()}
            contestId={id}
            contests={contests}
            trailing={
              <Badge tone="verified" icon={<Check className="size-3" strokeWidth={2.5} aria-hidden />}>
                Checked in
              </Badge>
            }
          />
        ))}
      </ListBody>
    </Section>
  );
}
