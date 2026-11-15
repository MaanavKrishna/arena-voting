"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import { arenaAbi } from "@/generated";
import { UNTITLED_ENTRY, type EntryMetadata } from "@/lib/metadata";
import { useArena } from "./useArena";
import { entryMetadataOptions, metadataStatus, type MetadataStatus } from "./useMetadata";
import { arenaKeys, parseContestId, retryUnlessRevert, type ContestId } from "./shared";
import type { EntryView } from "./types";

export type EntryWithMetadata = EntryView & {
  /** Parsed off-chain JSON; "Untitled entry" while loading or if it can't be read. */
  metadata: EntryMetadata;
  metadataStatus: MetadataStatus;
};

/** Entries of a contest (removed ones are included and flagged) with their IPFS metadata. */
export function useEntries(id: ContestId | undefined) {
  const { client, chainId, address, deployed } = useArena();
  const contestId = parseContestId(id);

  const q = useQuery({
    queryKey: arenaKeys.entries(chainId, contestId ?? 0n),
    enabled: deployed && !!client && contestId !== undefined,
    retry: retryUnlessRevert,
    queryFn: () =>
      client!.readContract({ address: address!, abi: arenaAbi, functionName: "getEntries", args: [contestId!] }),
  });

  const rows = q.data ?? [];
  const meta = useQueries({ queries: rows.map((e) => entryMetadataOptions(e.metadataURI)) });

  const data: EntryWithMetadata[] | undefined = q.data
    ? rows.map((e, i) => ({
        ...e,
        metadata: meta[i]?.data ?? UNTITLED_ENTRY,
        metadataStatus: metadataStatus(e.metadataURI, meta[i] ?? { isSuccess: false, isError: false }),
      }))
    : undefined;

  return {
    data,
    isPending: q.isPending,
    isError: q.isError,
    error: q.error,
    notDeployed: !deployed,
    refetch: q.refetch,
  };
}
