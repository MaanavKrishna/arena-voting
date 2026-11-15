"use client";

import { motion } from "motion/react";
import { Plus, Search, SearchX, Trophy, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LinkButton } from "@/components/landing/LinkButton";
import { ContestCard } from "@/components/contest/ContestCard";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { useReducedMotionPref } from "@/components/ui/hooks";
import { useContests } from "@/hooks/useContests";
import { staggerDelay, fade, spring } from "@/lib/motion";
import { buildExploreHref, parseTab, type ExploreTab } from "./explore-params";

const TAB_OPTIONS = [
  { value: "live", label: "Live" },
  { value: "upcoming", label: "Upcoming" },
  { value: "ended", label: "Ended" },
] as const;

const EMPTY_COPY: Record<ExploreTab, { title: string; description: string }> = {
  live: { title: "Nothing is live right now", description: "No contest is open for votes at the moment. Start one and it shows up here." },
  upcoming: { title: "Nothing coming up", description: "No contest is waiting to open. Plan the next one." },
  ended: { title: "No finished contests yet", description: "Contests land here once their voting closes." },
};

export const gridClass = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 md:gap-6";

export function ExploreView() {
  const router = useRouter();
  const params = useSearchParams();
  const reduced = useReducedMotionPref();

  const tab = parseTab(params.get("tab"));
  const urlQuery = params.get("q") ?? "";
  const [query, setQuery] = useState(urlQuery);
  const lastPushed = useRef(urlQuery);

  // Back/forward or a pasted link changes the URL: follow it.
  useEffect(() => {
    if (urlQuery !== lastPushed.current) {
      lastPushed.current = urlQuery;
      setQuery(urlQuery);
    }
  }, [urlQuery]);

  // Typing filters at once; the URL catches up shortly after.
  useEffect(() => {
    if (query.trim() === lastPushed.current.trim()) return;
    const id = setTimeout(() => {
      lastPushed.current = query.trim();
      router.replace(buildExploreHref(tab, query), { scroll: false });
    }, 250);
    return () => clearTimeout(id);
  }, [query, tab, router]);

  const setTab = (next: ExploreTab) => router.replace(buildExploreHref(next, query), { scroll: false });

  const { data, isPending, isError, notDeployed, refetch } = useContests({ tab, search: query });
  const searching = query.trim().length > 0;
  const [retrying, setRetrying] = useState(false);

  let body;
  if (notDeployed) {
    body = (
      <EmptyState
        icon={<Trophy strokeWidth={1.75} aria-hidden />}
        title="Arena isn't live on this network yet"
        description="The contract hasn't been deployed here, so there is nothing to show. Check back soon."
      />
    );
  } else if (isError) {
    body = (
      <ErrorState
        title="Couldn't load contests"
        description="We couldn't reach the network. Check your connection and try again."
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
      <div className={gridClass} aria-busy>
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  } else if (data.length === 0) {
    body = searching ? (
      <EmptyState
        icon={<SearchX strokeWidth={1.75} aria-hidden />}
        title={`No ${tab} contests match "${query.trim()}"`}
        description="Try another word, or clear the search to see everything in this tab."
        action={
          <Button variant="secondary" onClick={() => setQuery("")} icon={<X className="size-4" aria-hidden />}>
            Clear search
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={<Trophy strokeWidth={1.75} aria-hidden />}
        title={EMPTY_COPY[tab].title}
        description={EMPTY_COPY[tab].description}
        action={
          <LinkButton href="/create" icon={<Plus className="size-4" aria-hidden />}>
            Create the first contest
          </LinkButton>
        }
      />
    );
  } else {
    body = (
      <ul className={gridClass}>
        {data.map((c, i) => (
          <motion.li
            key={String(c.id)}
            className="flex"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduced ? fade : { ...spring.smooth, delay: staggerDelay(i) }}
          >
            <ContestCard contest={c} className="w-full" />
          </motion.li>
        ))}
      </ul>
    );
  }

  return (
    <>
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl
          aria-label="Contest status"
          options={TAB_OPTIONS}
          value={tab}
          onChange={setTab}
          stretch
          className="sm:w-auto"
        />
        <div className="sm:w-72">
          <Input
            type="search"
            aria-label="Search contests"
            placeholder="Search by title or organiser"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            leading={<Search className="size-4" strokeWidth={1.75} aria-hidden />}
            enterKeyHint="search"
            autoComplete="off"
          />
        </div>
      </div>
      <div role="tabpanel" aria-label={`${tab} contests`}>
        {body}
      </div>
    </>
  );
}

export function ExploreSkeleton() {
  return (
    <div className={gridClass} aria-busy>
      {Array.from({ length: 6 }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
