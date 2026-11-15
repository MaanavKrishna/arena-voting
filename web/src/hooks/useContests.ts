"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWatchContractEvent } from "wagmi";
import { arenaAbi } from "@/generated";
import { phaseOf } from "@/lib/phase";
import { useArena } from "./useArena";
import { useChainTime } from "./useChainTime";
import { arenaKeys, retryUnlessRevert } from "./shared";
import type { ContestView } from "./types";

export const CONTESTS_PAGE_SIZE = 50n;
const MAX_PAGES = 100;

export type ContestTab = "all" | "live" | "upcoming" | "ended";

/**
 * Tabs by phase: live = voting is open; upcoming = still taking entries or waiting for voting to
 * open; ended = voting closed (finalised or not).
 */
export function filterContests(
  contests: readonly ContestView[],
  opts: { tab?: ContestTab; search?: string },
  now: bigint,
): ContestView[] {
  const tab = opts.tab ?? "all";
  const needle = (opts.search ?? "").trim().toLowerCase();
  return contests.filter((c) => {
    if (tab !== "all") {
      const phase = phaseOf(c, now);
      const inTab =
        tab === "live"
          ? phase === "voting"
          : tab === "upcoming"
            ? phase === "submissions" || phase === "upcoming"
            : phase === "ended" || phase === "finalized";
      if (!inTab) return false;
    }
    if (needle) {
      const haystack = `${c.title} ${c.organiser} ${c.id}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

/** Pages `getContests` (newest first) until a page comes back short or empty. */
export async function loadAllContests(
  page: (offset: bigint, limit: bigint) => Promise<readonly ContestView[]>,
): Promise<ContestView[]> {
  const out: ContestView[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const rows = await page(BigInt(out.length), CONTESTS_PAGE_SIZE);
    out.push(...rows);
    if (BigInt(rows.length) < CONTESTS_PAGE_SIZE) break;
  }
  return out;
}

export function useContests({ tab = "all", search = "" }: { tab?: ContestTab; search?: string } = {}) {
  const { client, chainId, address, deployed } = useArena();
  const queryClient = useQueryClient();
  const { now } = useChainTime();

  const q = useQuery({
    queryKey: arenaKeys.contests(chainId),
    enabled: deployed && !!client,
    retry: retryUnlessRevert,
    queryFn: () =>
      loadAllContests((offset, limit) =>
        client!.readContract({ address: address!, abi: arenaAbi, functionName: "getContests", args: [offset, limit] }),
      ),
  });

  useWatchContractEvent({
    address,
    abi: arenaAbi,
    eventName: "ContestCreated",
    chainId,
    enabled: deployed,
    onLogs: () => void queryClient.invalidateQueries({ queryKey: arenaKeys.contests(chainId) }),
  });

  const data = useMemo(
    () => (q.data && now > 0n ? filterContests(q.data, { tab, search }, now) : undefined),
    [q.data, tab, search, now],
  );

  return {
    /** Contests in the chosen tab matching the search (newest first). */
    data,
    /** Every contest, unfiltered. */
    all: q.data,
    isPending: q.isPending || (q.isSuccess && now === 0n),
    isError: q.isError,
    error: q.error,
    notDeployed: !deployed,
    refetch: q.refetch,
  };
}
