"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useWatchContractEvent } from "wagmi";
import { arenaAbi } from "@/generated";
import { useArena } from "./useArena";
import { arenaKeys, parseContestId, type ContestId } from "./shared";

/**
 * Keeps one contest fresh: any vote, check-in, entry, beacon step or finalisation for this contest
 * invalidates everything cached under it (view, entries, voter state). Events arrive by polling
 * (config `pollingInterval`), not WebSockets.
 */
export function useLiveContest(id: ContestId | undefined): void {
  const { chainId, address, deployed } = useArena();
  const queryClient = useQueryClient();
  const contestId = parseContestId(id);
  const enabled = deployed && contestId !== undefined;

  const common = {
    address,
    abi: arenaAbi,
    chainId,
    enabled,
    args: contestId === undefined ? undefined : { contestId },
    onLogs: () => {
      if (contestId !== undefined) {
        void queryClient.invalidateQueries({ queryKey: arenaKeys.contest(chainId, contestId) });
      }
    },
  };

  useWatchContractEvent({ ...common, eventName: "VoteCast" });
  useWatchContractEvent({ ...common, eventName: "CheckedIn" });
  useWatchContractEvent({ ...common, eventName: "EntrySubmitted" });
  useWatchContractEvent({ ...common, eventName: "ContestFinalized" });
  useWatchContractEvent({ ...common, eventName: "BeaconAdvanced" });
}
