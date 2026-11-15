"use client";

import { useQuery } from "@tanstack/react-query";
import { useConnection } from "wagmi";
import { arenaAbi } from "@/generated";
import { useArena } from "./useArena";
import { arenaKeys, parseContestId, retryUnlessRevert, type ContestId } from "./shared";

export type VoterState = {
  /** 0 when the connected wallet hasn't voted. */
  votedEntryId: number;
  isCheckedIn: boolean;
};

/** What the contract knows about the connected wallet in this contest. `undefined` while disconnected. */
export function useVoterState(id: ContestId | undefined) {
  const { client, chainId, address, deployed } = useArena();
  const { address: account } = useConnection();
  const contestId = parseContestId(id);

  const q = useQuery({
    queryKey: arenaKeys.voter(chainId, contestId ?? 0n, account ?? "none"),
    enabled: deployed && !!client && contestId !== undefined && !!account,
    retry: retryUnlessRevert,
    queryFn: async (): Promise<VoterState> => {
      const [votedEntryId, isCheckedIn] = await client!.readContract({
        address: address!,
        abi: arenaAbi,
        functionName: "voterState",
        args: [contestId!, account!],
      });
      return { votedEntryId, isCheckedIn };
    },
  });

  return {
    data: account ? q.data : undefined,
    hasVoted: (q.data?.votedEntryId ?? 0) !== 0,
    isPending: !!account && q.isPending,
    isError: q.isError,
    error: q.error,
    refetch: q.refetch,
  };
}
