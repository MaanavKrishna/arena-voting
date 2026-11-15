"use client";

import { useQuery } from "@tanstack/react-query";
import { zeroHash, type Address, type Hex } from "viem";
import { fetchIpfsJson } from "@/lib/ipfs";
import { TicketList } from "@/lib/metadata";
import { loadTicketTree, type TicketTree } from "@/lib/tickets";
import { useContest } from "./useContest";
import { useArena } from "./useArena";
import { parseContestId, type ContestId } from "./shared";

export class TicketListMismatchError extends Error {
  override name = "TicketListMismatchError";
}

/** Rebuilds the tree from the published JSON and refuses it unless its root is the one on-chain. */
export function verifyTicketList(json: unknown, expectedRoot: Hex): TicketTree {
  const parsed = TicketList.safeParse(json);
  if (!parsed.success) throw new TicketListMismatchError("The guest list file isn't in the expected format.");
  let tree: TicketTree;
  try {
    tree = loadTicketTree(parsed.data.tree);
  } catch {
    throw new TicketListMismatchError("The guest list file couldn't be read.");
  }
  if (tree.root.toLowerCase() !== expectedRoot.toLowerCase()) {
    throw new TicketListMismatchError("The guest list file doesn't match the one the organiser published.");
  }
  return tree;
}

export async function fetchVerifiedTicketList(
  uri: string,
  expectedRoot: Hex,
  fetchJson: (uri: string) => Promise<unknown> = fetchIpfsJson,
): Promise<TicketTree> {
  return verifyTicketList(await fetchJson(uri), expectedRoot);
}

/** The contest's guest list (if it has one), checked against `ticketRoot`, plus `proofFor(address)`. */
export function useTicketList(id: ContestId | undefined) {
  const { chainId } = useArena();
  const contest = useContest(id);
  const root = contest.data?.ticketRoot;
  const uri = contest.data?.ticketListURI;
  const hasList = !!root && root !== zeroHash && !!uri;

  const q = useQuery({
    queryKey: ["ticket-list", chainId, parseContestId(id)?.toString() ?? "", root ?? "", uri ?? ""],
    enabled: hasList,
    staleTime: Infinity,
    retry: 1,
    queryFn: () => fetchVerifiedTicketList(uri!, root!),
  });

  return {
    tree: q.data,
    /** `null` when not on the list (or the list isn't loaded yet). */
    proofFor: (address: Address): Hex[] | null => q.data?.proofFor(address) ?? null,
    /** False for contests without a guest list (anyone may vote). */
    hasList,
    isPending: contest.isPending || (hasList && q.isPending),
    isError: contest.isError || q.isError,
    error: q.error ?? contest.error,
  };
}
