"use client";

import type { Hex } from "viem";
import { buildChain } from "@/lib/beacon/chain";
import type { ChainWorkerIn, ChainWorkerOut } from "@/lib/beacon/chain.worker";

let nextId = 0;

/** Builds c[0..length] in `chain.worker.ts` (≈ 60k keccak links for a 7-day vote); main thread if workers are missing. */
export function buildChainOffThread(seed: Hex, length: number): Promise<Hex[]> {
  if (typeof Worker === "undefined") return Promise.resolve(buildChain(seed, length));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../../lib/beacon/chain.worker.ts", import.meta.url), { type: "module", name: "arena-chain" });
    const id = ++nextId;
    worker.onmessage = (e: MessageEvent<ChainWorkerOut>) => {
      if (e.data.id !== id) return;
      worker.terminate();
      if ("chain" in e.data) resolve(e.data.chain);
      else reject(new Error(e.data.error));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || "Couldn't build the beacon chain."));
    };
    const msg: ChainWorkerIn = { id, seed, length };
    worker.postMessage(msg);
  });
}
