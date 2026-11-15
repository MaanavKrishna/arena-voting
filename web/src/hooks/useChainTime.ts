"use client";

import { useEffect, useReducer } from "react";
import { useQuery } from "@tanstack/react-query";
import { useArena } from "./useArena";
import { useNow } from "./useNow";

/** Samples kept; the maximum of these is the offset (the freshest observation is closest to the truth). */
export const MAX_SAMPLES = 30;
/** The contract accepts beacon tokens 30 s early and 120 s late, so only a larger skew is worth a warning. */
export const SKEW_WARNING_SECONDS = 15;
export const POLL_INTERVAL_MS = 2_000;

export type ChainTimeState = {
  lastBlock: bigint | null;
  /** `blockTimestamp - localSecondsWhenFirstSeen`, newest last. */
  samples: number[];
  /** Seconds to add to the local clock to get chain time. */
  offset: number;
  skewWarning: boolean;
  /** At least one block has been sampled. */
  ready: boolean;
};

export type ChainTimeAction =
  | { type: "block"; blockNumber: bigint; blockTimestamp: bigint; localNowMs: number }
  | { type: "reset" };

export const initialChainTime: ChainTimeState = {
  lastBlock: null,
  samples: [],
  offset: 0,
  skewWarning: false,
  ready: false,
};

/**
 * docs/ground-presence.md#timing. A block's timestamp is 0-12 s old when we read it, so one sample
 * is biased slow. We only sample when a block number is seen for the first time (the reading
 * is then at its freshest) and keep the maximum of the last 30 samples as the offset.
 */
export function chainTimeReducer(state: ChainTimeState, action: ChainTimeAction): ChainTimeState {
  if (action.type === "reset") return initialChainTime;
  if (state.lastBlock === action.blockNumber) return state;

  const sample = Number(action.blockTimestamp) - action.localNowMs / 1000;
  const samples = [...state.samples, sample].slice(-MAX_SAMPLES);
  const offset = Math.max(...samples);
  return {
    lastBlock: action.blockNumber,
    samples,
    offset,
    skewWarning: Math.abs(offset) > SKEW_WARNING_SECONDS,
    ready: true,
  };
}

export type ChainTime = {
  /** Chain time in unix seconds: the device clock plus the measured offset. */
  now: bigint;
  /** Seconds the device clock is behind the chain (negative: ahead). */
  offset: number;
  skewWarning: boolean;
  /** False until the first block has been read; `now` is the device clock until then. */
  ready: boolean;
};

/** Chain time that follows the latest block rather than the device clock. */
export function useChainTime(): ChainTime {
  const { client, chainId } = useArena();
  const local = useNow();
  const [state, dispatch] = useReducer(chainTimeReducer, initialChainTime);

  const { data } = useQuery({
    queryKey: ["arena", chainId, "latest-block-time"],
    enabled: !!client,
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: 0,
    gcTime: 0,
    queryFn: async () => {
      const block = await client!.getBlock({ blockTag: "latest" });
      return { number: block.number, timestamp: block.timestamp, seenAtMs: Date.now() };
    },
  });

  useEffect(() => {
    if (!data) return;
    dispatch({
      type: "block",
      blockNumber: data.number,
      blockTimestamp: data.timestamp,
      localNowMs: data.seenAtMs,
    });
  }, [data]);

  return {
    now: local === 0n ? 0n : local + BigInt(Math.round(state.offset)),
    offset: state.offset,
    skewWarning: state.skewWarning,
    ready: state.ready,
  };
}
