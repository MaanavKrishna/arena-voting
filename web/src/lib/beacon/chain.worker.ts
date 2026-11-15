/**
 * Builds a beacon hash chain off the main thread (a 7-day contest is ~60k keccak links).
 * In: { id, seed, length }. Out: { id, chain } or { id, error }.
 */
import type { Hex } from "viem";
import { buildChain } from "./chain";

export type ChainWorkerIn = { id: number; seed: Hex; length: number };
export type ChainWorkerOut = { id: number; chain: Hex[] } | { id: number; error: string };

const scope = self as unknown as {
  postMessage(msg: ChainWorkerOut): void;
  onmessage: ((e: MessageEvent<ChainWorkerIn>) => void) | null;
};

scope.onmessage = (e) => {
  const { id, seed, length } = e.data;
  try {
    scope.postMessage({ id, chain: buildChain(seed, length) });
  } catch (err) {
    scope.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
