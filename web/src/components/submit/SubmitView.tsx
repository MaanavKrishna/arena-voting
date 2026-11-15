"use client";

import { Hourglass, PackageX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useConnection } from "wagmi";
import { BackLink, ContestNotFoundNotice, PageContainer, PageNotice, PageSkeleton } from "@/components/manage/pageBits";
import { ErrorState } from "@/components/ui/ErrorState";
import { useContest } from "@/hooks/useContest";
import { parseContestId } from "@/hooks/shared";
import { SubmitEntryForm } from "./SubmitEntryForm";

const MAX_ENTRIES = 64;

/** `/c/[id]/submit`: works out who may add an entry right now, then shows the form or says why not. */
export function SubmitView({ contestId }: { contestId: string }) {
  const router = useRouter();
  const id = parseContestId(contestId);
  const contest = useContest(id);
  const { address: account } = useConnection();

  if (id === undefined) return <ContestNotFoundNotice />;
  if (contest.notDeployed) {
    return (
      <PageContainer narrow>
        <ErrorState title="Arena isn't available on this network yet." description="Switch to the network this app targets, or check back soon." />
      </PageContainer>
    );
  }
  if (contest.isPending) return <PageSkeleton narrow />;
  if (!contest.data) return <ContestNotFoundNotice isError={contest.isError} onRetry={() => void contest.refetch()} />;

  const c = contest.data;
  const isOrganiser = !!account && account.toLowerCase() === c.organiser.toLowerCase();

  if (contest.phase && contest.phase !== "submissions") {
    return (
      <PageNotice
        contestId={contestId}
        icon={<Hourglass strokeWidth={1.75} />}
        title="Entries are closed"
        description="This contest stopped accepting new entries. You can still see the ones that made it."
      />
    );
  }
  if (c.entryCount >= MAX_ENTRIES) {
    return (
      <PageNotice
        contestId={contestId}
        icon={<PackageX strokeWidth={1.75} />}
        title="This contest is full"
        description={`It already has ${MAX_ENTRIES} entries, the most a contest can hold.`}
      />
    );
  }
  if (!c.openSubmissions && !isOrganiser) {
    return (
      <PageNotice
        contestId={contestId}
        title="Only the organiser adds entries here"
        description={
          account
            ? "This contest is curated: the organiser picks the entries and adds them for each team. Talk to them if you'd like to take part."
            : "This contest is curated: the organiser picks the entries and adds them for each team. If you're the organiser, connect your wallet to add entries."
        }
      />
    );
  }

  return (
    <PageContainer narrow>
      <BackLink href={`/c/${contestId}`}>{c.title}</BackLink>
      <header className="mt-4 mb-8 md:mb-10">
        <h1 className="text-display text-fg">{c.openSubmissions ? "Submit your entry" : "Add an entry"}</h1>
        <p className="text-body text-fg-muted mt-2 text-pretty">
          {c.openSubmissions
            ? "Tell voters what you built. You'll confirm one transaction in your wallet."
            : "You're the organiser, so you add entries for each team. You'll confirm one transaction in your wallet."}
        </p>
      </header>
      <SubmitEntryForm
        contestId={id}
        payeeHint={!c.openSubmissions ? "Where this team's prize should go if they win. Set it to the team's wallet, not yours." : undefined}
        onSubmitted={() => router.push(`/c/${contestId}`)}
      />
    </PageContainer>
  );
}
