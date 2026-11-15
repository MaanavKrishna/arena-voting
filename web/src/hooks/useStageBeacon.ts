"use client";

import { useMemo } from "react";
import { bytesToHex, type Hex } from "viem";
import { SLOT_SECONDS, slotAt, tokenForSlot } from "@/lib/beacon/chain";
import { encodePayload, toQrText } from "@/lib/beacon/payload";
import { useChainTime } from "./useChainTime";

export type SlotClock = {
  /** Current slot, or null before the chain starts / after it ends. */
  slot: number | null;
  /** Seconds until the chain starts (0 once started). */
  startsIn: number;
  /** Seconds left in the current slot (0 when there is no slot). */
  slotEndsIn: number;
  /** True once chain time is past the last slot. */
  finished: boolean;
};

/** The slot clock at a chain time. Pure: the hook feeds it chain time (device clock + measured offset). */
export function slotClock(chainNow: bigint, start: bigint, length: number): SlotClock {
  if (length <= 0) return { slot: null, startsIn: 0, slotEndsIn: 0, finished: true };
  if (chainNow < start) return { slot: null, startsIn: Number(start - chainNow), slotEndsIn: 0, finished: false };
  const slot = slotAt(start, chainNow, length);
  if (slot === null) return { slot: null, startsIn: 0, slotEndsIn: 0, finished: true };
  const slotEnd = start + BigInt(slot + 1) * BigInt(SLOT_SECONDS);
  return { slot, startsIn: 0, slotEndsIn: Number(slotEnd - chainNow), finished: false };
}

export type StageBeaconInput = {
  contestId: bigint | undefined;
  /** Full chain c[0..N] (from chain.worker), or null while not built. */
  chain: readonly Hex[] | null;
  start: bigint;
  length: number;
};

export type StageBeacon = SlotClock & {
  /** Chain time in unix seconds (0n until mounted). */
  now: bigint;
  /** Chain time has at least one block sample. */
  timeReady: boolean;
  offset: number;
  skewWarning: boolean;
  token: Hex | null;
  /** Raw 25-byte payload for the sound transport, or null. */
  payload: Uint8Array | null;
  payloadHex: Hex | null;
  /** `arena:b1:…` text for the rotating QR, or null. */
  qrText: string | null;
};

/**
 * The Stage's beacon clock: follows chain time (useChainTime), picks the token for the current
 * slot and encodes it for sound (raw bytes) and the QR fallback. Re-derives only when the slot
 * changes, so the payload object stays stable within a slot.
 */
export function useStageBeacon({ contestId, chain, start, length }: StageBeaconInput): StageBeacon {
  const time = useChainTime();
  const clock = time.now === 0n ? { slot: null, startsIn: 0, slotEndsIn: 0, finished: false } : slotClock(time.now, start, length);
  const slot = clock.slot;

  const encoded = useMemo(() => {
    if (slot === null || !chain || contestId === undefined || chain.length !== length + 1) return null;
    const token = tokenForSlot(chain, slot);
    const p = { contestId: Number(contestId), slot, token };
    const payload = encodePayload(p);
    return { token, payload, payloadHex: bytesToHex(payload), qrText: toQrText(p) };
  }, [slot, chain, contestId, length]);

  return {
    ...clock,
    now: time.now,
    timeReady: time.ready,
    offset: time.offset,
    skewWarning: time.skewWarning,
    token: encoded?.token ?? null,
    payload: encoded?.payload ?? null,
    payloadHex: encoded?.payloadHex ?? null,
    qrText: encoded?.qrText ?? null,
  };
}
