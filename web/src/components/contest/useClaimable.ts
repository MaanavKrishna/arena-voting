"use client";

import { useQuery } from "@tanstack/react-query";
import { useConnection } from "wagmi";
import { arenaAbi } from "@/generated";
import { useArena } from "@/hooks/useArena";
import { arenaKeys, retryUnlessRevert } from "@/hooks/shared";

/**
 * What Arena owes the connected wallet (`claimable`), across all contests. Cached under the
 * contest's key so `useLiveContest` refreshes it when the contest is finalised.
 * Lives here because hooks/ belongs to the data-layer task; move it there when convenient.
 */
export function useClaimable(contestId: bigint | undefined) {
  const { client, chainId, address, deployed } = useArena();
  const { address: account } = useConnection();
  const q = useQuery({
    queryKey: [...arenaKeys.contest(chainId, contestId ?? 0n), "claimable", (account ?? "none").toLowerCase()],
    enabled: deployed && !!client && !!account && contestId !== undefined,
    retry: retryUnlessRevert,
    queryFn: () =>
      client!.readContract({ address: address!, abi: arenaAbi, functionName: "claimable", args: [account!] }),
  });
  return { amount: account ? q.data : undefined, refetch: q.refetch };
}
