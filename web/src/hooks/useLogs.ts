"use client";

import { useQuery } from "@tanstack/react-query";
import { stringify, type GetContractEventsReturnType } from "viem";
import { arenaAbi } from "@/generated";
import { deploymentBlock } from "@/config/contracts";
import { useArena } from "./useArena";
import { arenaKeys } from "./shared";
import type { ArenaEventName } from "./types";

export const LOG_CHUNK = 500n;
/** Chunks this close to the head may still reorg, so they aren't cached. */
export const LOG_CACHE_CONFIRMATIONS = 12n;

const RANGE_ERROR =
  /block range|range (is )?too|exceed|too many (results|logs)|10000|query returned more than|response size|max(imum)? (allowed )?(block|range)|log response|payload too large/i;

/** True for the "ask for fewer blocks" family of RPC errors (provider wording varies a lot). */
export function isRangeError(err: unknown): boolean {
  let cur: unknown = err;
  for (let i = 0; i < 8 && cur && typeof cur === "object"; i++) {
    const o = cur as { shortMessage?: unknown; message?: unknown; details?: unknown; cause?: unknown };
    for (const t of [o.shortMessage, o.message, o.details]) {
      if (typeof t === "string" && RANGE_ERROR.test(t)) return true;
    }
    cur = o.cause;
  }
  return false;
}

export type LogChunkCache<T> = Map<string, T[]>;

/**
 * Reads logs in `chunk`-block windows from `fromBlock` to `toBlock`. When the node rejects a window
 * as too large the window halves (and stays smaller for the rest of the run). Windows that end at
 * or before `cacheUpTo` are cached under `cachePrefix`, so a refetch only re-reads the recent tail.
 */
export async function fetchLogsChunked<T>(o: {
  fromBlock: bigint;
  toBlock: bigint;
  getLogs: (from: bigint, to: bigint) => Promise<T[]>;
  chunk?: bigint;
  cache?: LogChunkCache<T>;
  cachePrefix?: string;
  cacheUpTo?: bigint;
}): Promise<T[]> {
  const out: T[] = [];
  let size = o.chunk ?? LOG_CHUNK;
  let cursor = o.fromBlock;
  while (cursor <= o.toBlock) {
    const end = cursor + size - 1n > o.toBlock ? o.toBlock : cursor + size - 1n;
    const key = `${o.cachePrefix ?? ""}:${cursor}-${end}`;
    const hit = o.cache?.get(key);
    if (hit) {
      out.push(...hit);
      cursor = end + 1n;
      continue;
    }
    try {
      const logs = await o.getLogs(cursor, end);
      if (o.cache && o.cacheUpTo !== undefined && end <= o.cacheUpTo) o.cache.set(key, logs);
      out.push(...logs);
      cursor = end + 1n;
    } catch (err) {
      if (size > 1n && isRangeError(err)) {
        size = size / 2n || 1n;
        continue;
      }
      throw err;
    }
  }
  return out;
}

const chunkCache: LogChunkCache<unknown> = new Map();

/**
 * Decoded Arena logs for one event, from the deployment block to the chain head, optionally
 * filtered by indexed args (e.g. `{ organiser }`). Used for history views (/me, gatekeeper lists).
 */
export function useLogs<E extends ArenaEventName>(
  event: E,
  args?: Record<string, unknown>,
  opts: { enabled?: boolean } = {},
) {
  const { client, chainId, address, deployed } = useArena();
  const argsKey = args ? stringify(args) : "";

  return useQuery({
    queryKey: arenaKeys.logs(chainId, event, argsKey),
    enabled: deployed && !!client && (opts.enabled ?? true),
    staleTime: 15_000,
    queryFn: async () => {
      const head = await client!.getBlockNumber();
      const from = deploymentBlock(chainId) ?? 0n;
      const logs = await fetchLogsChunked<unknown>({
        fromBlock: from,
        toBlock: head,
        cache: chunkCache,
        cachePrefix: `${chainId}:${address}:${event}:${argsKey}`,
        cacheUpTo: head - LOG_CACHE_CONFIRMATIONS,
        getLogs: (fromBlock, toBlock) =>
          client!.getContractEvents({
            address: address!,
            abi: arenaAbi,
            eventName: event,
            args: args as never,
            fromBlock,
            toBlock,
          }) as Promise<unknown[]>,
      });
      return logs as GetContractEventsReturnType<typeof arenaAbi, E>;
    },
  });
}
