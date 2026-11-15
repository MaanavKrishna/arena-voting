"use client";

import { ArrowRight, Plus, Trophy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ContestCard } from "@/components/contest/ContestCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { useContests } from "@/hooks/useContests";
import { LinkButton } from "./LinkButton";

const grid = "grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6";

export function LiveStrip() {
  const { data, isPending, isError, notDeployed, refetch } = useContests({ tab: "live" });
  const [retrying, setRetrying] = useState(false);
  const live = data?.slice(0, 3) ?? [];

  let body;
  if (notDeployed) {
    body = (
      <EmptyState
        icon={<Trophy strokeWidth={1.75} aria-hidden />}
        title="Arena isn't live on this network yet"
        description="The contract hasn't been deployed here, so there are no contests to show."
      />
    );
  } else if (isError) {
    body = (
      <ErrorState
        title="Couldn't load live contests"
        retrying={retrying}
        onRetry={async () => {
          setRetrying(true);
          await refetch();
          setRetrying(false);
        }}
      />
    );
  } else if (isPending || !data) {
    body = (
      <div className={grid} aria-busy>
        {[0, 1, 2].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  } else if (live.length === 0) {
    body = (
      <EmptyState
        icon={<Trophy strokeWidth={1.75} aria-hidden />}
        title="No contests are live right now"
        description="Be the first. Set a prize, add entries and open the vote."
        action={
          <LinkButton href="/create" icon={<Plus className="size-4" aria-hidden />}>
            Create the first contest
          </LinkButton>
        }
      />
    );
  } else {
    body = (
      <ul className={grid}>
        {live.map((c, i) => (
          <li key={String(c.id)} className="flex">
            <ContestCard contest={c} beam={i === 0} className="w-full" />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section aria-labelledby="live-heading" className="max-w-content mx-auto w-full px-4 pb-24 md:px-8 md:pb-32">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="text-caption-caps text-fg-muted mb-3">Happening now</p>
          <h2 id="live-heading" className="text-display text-fg">
            Live contests
          </h2>
        </div>
        <Link
          href="/explore"
          className="text-callout text-accent hover:text-accent/80 focus-visible:outline-accent inline-flex items-center gap-1 rounded-xs py-2 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          See all
          <ArrowRight className="size-4" strokeWidth={1.75} aria-hidden />
        </Link>
      </div>
      {body}
    </section>
  );
}
