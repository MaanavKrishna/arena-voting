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

/** Windows read at the same time. Small, so public RPCs don't rate-limit a cold /me page. */
export const LOG_CONCURRENCY = 4;

type Window = { from: bigint; to: bigint; size: bigint };

/**
 * Reads logs in `chunk`-block windows from `fromBlock` to `toBlock`, up to `concurrency` windows
 * at a time, and returns them in block order. When the node rejects a window as too large, the
 * window size halves (and stays smaller for the rest of the run) and that window is re-read in
 * the smaller size. Windows that end at or before `cacheUpTo` are cached under `cachePrefix`, so
 * a refetch only re-reads the recent tail.
 */
export async function fetchLogsChunked<T>(o: {
  fromBlock: bigint;
  toBlock: bigint;
  getLogs: (from: bigint, to: bigint) => Promise<T[]>;
  chunk?: bigint;
  concurrency?: number;
  cache?: LogChunkCache<T>;
  cachePrefix?: string;
  cacheUpTo?: bigint;
}): Promise<T[]> {
  let size = o.chunk ?? LOG_CHUNK;
  let cursor = o.fromBlock;
  const redo: Window[] = [];
  const done: { from: bigint; logs: T[] }[] = [];
  let failure: { err: unknown } | null = null;

  const take = (): Window | null => {
    const again = redo.shift();
    if (again) return again;
    if (cursor > o.toBlock) return null;
    const end = cursor + size - 1n > o.toBlock ? o.toBlock : cursor + size - 1n;
    const w = { from: cursor, to: end, size };
    cursor = end + 1n;
    return w;
  };

  const worker = async () => {
    for (let w = take(); w && !failure; w = take()) {
      const key = `${o.cachePrefix ?? ""}:${w.from}-${w.to}`;
      const hit = o.cache?.get(key);
      if (hit) {
        done.push({ from: w.from, logs: hit });
        continue;
      }
      try {
        const logs = await o.getLogs(w.from, w.to);
        if (o.cache && o.cacheUpTo !== undefined && w.to <= o.cacheUpTo) o.cache.set(key, logs);
        done.push({ from: w.from, logs });
      } catch (err) {
        if (w.to > w.from && isRangeError(err)) {
          const half = w.size / 2n || 1n;
          if (half < size) size = half;
          const step = size;
          for (let f = w.from; f <= w.to; f += step) {
            redo.push({ from: f, to: f + step - 1n > w.to ? w.to : f + step - 1n, size: step });
          }
          continue;
        }
        failure = { err };
      }
    }
  };

  const n = Math.max(1, o.concurrency ?? LOG_CONCURRENCY);
  await Promise.all(Array.from({ length: n }, worker));
  if (failure) throw (failure as { err: unknown }).err;
  done.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  return done.flatMap((d) => d.logs);
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
