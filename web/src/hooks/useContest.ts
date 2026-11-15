"use client";

import { useQuery } from "@tanstack/react-query";
import { arenaAbi } from "@/generated";
import { phaseOf, type Phase } from "@/lib/phase";
import { useArena } from "./useArena";
import { useChainTime } from "./useChainTime";
import { arenaKeys, parseContestId, retryUnlessRevert, type ContestId } from "./shared";

/** One contest plus its phase at chain time. `notDeployed` when the contract isn't on this network. */
export function useContest(id: ContestId | undefined) {
  const { client, chainId, address, deployed } = useArena();
  const contestId = parseContestId(id);
  const { now } = useChainTime();

  const q = useQuery({
    queryKey: arenaKeys.contestView(chainId, contestId ?? 0n),
    enabled: deployed && !!client && contestId !== undefined,
    retry: retryUnlessRevert,
    queryFn: () =>
      client!.readContract({ address: address!, abi: arenaAbi, functionName: "getContest", args: [contestId!] }),
  });

  const phase: Phase | undefined = q.data && now > 0n ? phaseOf(q.data, now) : undefined;
  return {
    data: q.data,
    phase,
    isPending: q.isPending,
    isError: q.isError,
    error: q.error,
    notDeployed: !deployed,
    refetch: q.refetch,
  };
}
