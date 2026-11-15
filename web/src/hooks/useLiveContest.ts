"use client";

import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useWatchContractEvent } from "wagmi";
import { arenaAbi } from "@/generated";
import { useArena } from "./useArena";
import { arenaKeys, parseContestId, type ContestId } from "./shared";
import type { ArenaEventName } from "./types";

/** Every per-contest event that changes what a contest, Stage, Gate or Manage screen shows. */
export const LIVE_EVENTS = [
  "VoteCast",
  "CheckedIn",
  "EntrySubmitted",
  "EntryWithdrawn",
  "ContestFinalized",
  "BeaconSet",
  "BeaconAdvanced",
  "TicketListSet",
  "GatekeeperSet",
] as const satisfies readonly ArenaEventName[];
export type LiveEvent = (typeof LIVE_EVENTS)[number];

/**
 * What to refetch for one event. Everything about the contest sits under one key (view, entries,
 * voter state, gatekeeper flag; the ticket list follows the new root from the view). Gatekeeper
 * changes also refresh the GatekeeperSet history the Manage page lists.
 */
export function liveInvalidations(event: LiveEvent, chainId: number, contestId: bigint): QueryKey[] {
  const keys: QueryKey[] = [arenaKeys.contest(chainId, contestId)];
  if (event === "GatekeeperSet") keys.push(["arena", chainId, "logs", "GatekeeperSet"]);
  return keys;
}

/**
 * Keeps one contest fresh: any of `LIVE_EVENTS` for this contest invalidates what it changed.
 * Events arrive by polling (config `pollingInterval`), not WebSockets.
 */
export function useLiveContest(id: ContestId | undefined): void {
  const { chainId, address, deployed } = useArena();
  const queryClient = useQueryClient();
  const contestId = parseContestId(id);
  const enabled = deployed && contestId !== undefined;

  const watch = (eventName: LiveEvent) => ({
    address,
    abi: arenaAbi,
    chainId,
    enabled,
    eventName,
    args: contestId === undefined ? undefined : { contestId },
    onLogs: () => {
      if (contestId === undefined) return;
      for (const queryKey of liveInvalidations(eventName, chainId, contestId)) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });

  // One hook call per event (hooks can't run in a loop); keep in step with LIVE_EVENTS.
  useWatchContractEvent(watch("VoteCast"));
  useWatchContractEvent(watch("CheckedIn"));
  useWatchContractEvent(watch("EntrySubmitted"));
  useWatchContractEvent(watch("EntryWithdrawn"));
  useWatchContractEvent(watch("ContestFinalized"));
  useWatchContractEvent(watch("BeaconSet"));
  useWatchContractEvent(watch("BeaconAdvanced"));
  useWatchContractEvent(watch("TicketListSet"));
  useWatchContractEvent(watch("GatekeeperSet"));
}
