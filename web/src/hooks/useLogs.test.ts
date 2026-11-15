import { describe, expect, it, vi } from "vitest";
import { LOG_CHUNK, LOG_CONCURRENCY, fetchLogsChunked, isRangeError } from "./useLogs";

/** A fake chain: one log per block, with an RPC that rejects windows above `maxRange` blocks. */
function fakeRpc(maxRange: bigint) {
  const calls: [bigint, bigint][] = [];
  const getLogs = vi.fn(async (from: bigint, to: bigint) => {
    calls.push([from, to]);
    if (to - from + 1n > maxRange) throw new Error("eth_getLogs is limited to a 10 block range");
    return Array.from({ length: Number(to - from + 1n) }, (_, i) => Number(from) + i);
  });
  return { getLogs, calls };
}

describe("fetchLogsChunked", () => {
  it("reads in 500-block windows", async () => {
    const { getLogs, calls } = fakeRpc(10_000n);
    const logs = await fetchLogsChunked({ fromBlock: 100n, toBlock: 1_299n, getLogs });
    expect(calls).toEqual([
      [100n, 599n],
      [600n, 1099n],
      [1100n, 1299n],
    ]);
    expect(logs).toHaveLength(1_200);
    expect(logs[0]).toBe(100);
    expect(logs.at(-1)).toBe(1299);
    expect(LOG_CHUNK).toBe(500n);
  });

  it("halves the window on range errors until the node accepts it, then keeps that size", async () => {
    const { getLogs, calls } = fakeRpc(100n);
    const logs = await fetchLogsChunked({ fromBlock: 0n, toBlock: 399n, getLogs });
    expect(logs).toEqual(Array.from({ length: 400 }, (_, i) => i));
    // 500→250→125→62 (each halving retried from block 0), then 62-block windows
    expect(calls.filter(([f]) => f === 0n).map(([f, t]) => t - f + 1n)).toEqual([400n, 250n, 125n, 62n]);
    const okCalls = calls.filter(([f, t]) => t - f + 1n <= 100n);
    expect(okCalls.every(([f, t]) => t - f + 1n <= 62n)).toBe(true);
    // once the size has dropped, windows not yet planned start at the smaller size
    const firstOk = calls.findIndex(([f, t]) => t - f + 1n <= 62n);
    expect(calls.slice(firstOk).every(([f, t]) => t - f + 1n <= 125n)).toBe(true);
  });

  it("reads up to LOG_CONCURRENCY windows at once and keeps block order", async () => {
    let inFlight = 0;
    let peak = 0;
    const getLogs = vi.fn(async (from: bigint, to: bigint) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      // later windows answer first, to prove the result is reassembled in order
      await new Promise((r) => setTimeout(r, Number(10_000n - from) / 1000));
      inFlight--;
      return Array.from({ length: Number(to - from + 1n) }, (_, i) => Number(from) + i);
    });
    const logs = await fetchLogsChunked({ fromBlock: 0n, toBlock: 4_999n, getLogs });
    expect(LOG_CONCURRENCY).toBe(4);
    expect(peak).toBe(LOG_CONCURRENCY);
    expect(getLogs).toHaveBeenCalledTimes(10);
    expect(logs).toEqual(Array.from({ length: 5_000 }, (_, i) => i));
  });

  it("halves on range errors while reading in parallel", async () => {
    const { getLogs } = fakeRpc(100n);
    const logs = await fetchLogsChunked({ fromBlock: 0n, toBlock: 2_999n, getLogs });
    expect(logs).toEqual(Array.from({ length: 3_000 }, (_, i) => i));
  });

  it("does not swallow other errors", async () => {
    const getLogs = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(fetchLogsChunked({ fromBlock: 0n, toBlock: 10n, getLogs })).rejects.toThrow("boom");
    expect(getLogs).toHaveBeenCalledTimes(1);
  });

  it("gives up at a single block", async () => {
    const getLogs = vi.fn().mockRejectedValue(new Error("query returned more than 10000 results"));
    await expect(fetchLogsChunked({ fromBlock: 0n, toBlock: 3n, getLogs })).rejects.toThrow();
  });

  it("caches settled chunks per range and never the recent tail", async () => {
    const cache = new Map<string, number[]>();
    const { getLogs } = fakeRpc(10_000n);
    const opts = { fromBlock: 0n, toBlock: 1_099n, cache, cachePrefix: "c", cacheUpTo: 1_000n, getLogs };
    await fetchLogsChunked(opts);
    expect([...cache.keys()]).toEqual(["c:0-499", "c:500-999"]);
    expect(getLogs).toHaveBeenCalledTimes(3);

    getLogs.mockClear();
    const again = await fetchLogsChunked(opts);
    expect(getLogs).toHaveBeenCalledTimes(1); // only the uncached tail
    expect(getLogs).toHaveBeenCalledWith(1_000n, 1_099n);
    expect(again).toHaveLength(1_100);
  });

  it("returns nothing for an empty range", async () => {
    const { getLogs } = fakeRpc(10n);
    expect(await fetchLogsChunked({ fromBlock: 10n, toBlock: 9n, getLogs })).toEqual([]);
    expect(getLogs).not.toHaveBeenCalled();
  });
});

describe("isRangeError", () => {
  it("recognises common provider wording, including nested causes", () => {
    for (const m of [
      "Log response size exceeded",
      "block range is too large",
      "query returned more than 10000 results",
      "exceed maximum block range: 500",
      "eth_getLogs is limited to a 10 block range",
    ]) {
      expect(isRangeError(new Error(m))).toBe(true);
    }
    expect(isRangeError(new Error("outer", { cause: new Error("block range too wide") }))).toBe(true);
    expect(isRangeError(new Error("connection refused"))).toBe(false);
    expect(isRangeError(new Error("429 rate limit hit on eth_getLogs"))).toBe(false);
    expect(isRangeError(undefined)).toBe(false);
  });
});
