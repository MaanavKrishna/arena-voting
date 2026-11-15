import "server-only";
import { createPublicClient, http, type Address } from "viem";
import { foundry } from "viem/chains";
import { serverEnv } from "@/config/env.server";
import { arenaAddress } from "@/config/contracts";
import { rpcUrl, targetChain } from "@/config/network";
import { arenaAbi } from "@/generated";

/**
 * Server-side chain reads for the sitemap and share images. They use the private RPC key
 * (SEPOLIA_RPC_URL) on the public network and the local node under Anvil. Every read is bounded by
 * a timeout and callers fall back to something sensible, so a slow RPC never breaks a page.
 */

/** Per request, and for the whole sitemap walk. */
export const RPC_TIMEOUT_MS = 4_000;
/** The contract caps a page at 50. */
const PAGE_SIZE = 50n;
/** 20 pages = 1000 contests; plenty for this phase and a hard stop for the sitemap. */
const MAX_PAGES = 20;

/** The two calls these helpers make, so tests can hand in a fake client. */
export type ArenaReader = {
  readContract(args: {
    address: Address;
    abi: typeof arenaAbi;
    functionName: "getContests" | "getContest";
    args: readonly bigint[];
  }): Promise<unknown>;
};

export function serverRpcUrl(): string | undefined {
  if (targetChain.id === foundry.id) return rpcUrl(targetChain.id);
  return serverEnv.SEPOLIA_RPC_URL ?? rpcUrl(targetChain.id);
}

/** `null` when there's no RPC URL or no deployment on the target chain. */
export function serverReader(): { client: ArenaReader; address: Address } | null {
  const url = serverRpcUrl();
  const address = arenaAddress(targetChain.id);
  if (!url || !address) return null;
  const client = createPublicClient({
    chain: targetChain,
    transport: http(url, { timeout: RPC_TIMEOUT_MS, retryCount: 0 }),
  });
  return { client: client as unknown as ArenaReader, address };
}

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`RPC deadline of ${ms} ms passed`)), ms);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

type ContestRow = { id: bigint; title: string; totalVotes: number; finalized: boolean };

/** Every contest id, newest first, as decimal strings. Throws on RPC failure or timeout. */
export async function listContestIds(
  reader: { client: ArenaReader; address: Address },
  timeoutMs = RPC_TIMEOUT_MS * 2,
): Promise<string[]> {
  const walk = async () => {
    const ids: string[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const rows = (await reader.client.readContract({
        address: reader.address,
        abi: arenaAbi,
        functionName: "getContests",
        args: [BigInt(page) * PAGE_SIZE, PAGE_SIZE],
      })) as readonly ContestRow[];
      for (const row of rows) ids.push(row.id.toString());
      if (BigInt(rows.length) < PAGE_SIZE) break;
    }
    return ids;
  };
  return withDeadline(walk(), timeoutMs);
}

export type ContestSummary = { title: string; totalVotes: number; finalized: boolean };

/** Title and vote total for a share image, or `null` if it can't be read in time. */
export async function readContestSummary(id: bigint): Promise<ContestSummary | null> {
  const reader = serverReader();
  if (!reader) return null;
  try {
    const row = (await withDeadline(
      reader.client.readContract({
        address: reader.address,
        abi: arenaAbi,
        functionName: "getContest",
        args: [id],
      }),
      RPC_TIMEOUT_MS,
    )) as ContestRow;
    return { title: row.title, totalVotes: Number(row.totalVotes), finalized: row.finalized };
  } catch {
    return null;
  }
}
