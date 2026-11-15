import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { keccak256 } from "viem";
import { buildChain, tokenForSlot } from "@/lib/beacon/chain";
import { decodePayload } from "@/lib/beacon/payload";
import type { ChainTime } from "./useChainTime";
import { slotClock, useStageBeacon } from "./useStageBeacon";

const time: { current: ChainTime } = { current: { now: 0n, offset: 0, skewWarning: false, ready: false } };
vi.mock("./useChainTime", () => ({ useChainTime: () => time.current }));

/** What useChainTime reports for a device clock `deviceNow` that is `skew` seconds behind the chain. */
function chainTimeFor(deviceNow: number, offset: number): ChainTime {
  return { now: BigInt(deviceNow + Math.round(offset)), offset, skewWarning: Math.abs(offset) > 15, ready: true };
}

const SEED = keccak256("0xc0ffee");
const N = 100;
const START = 1_000_000n;
const chain = buildChain(SEED, N);

describe("slotClock", () => {
  it("before the chain starts: no slot, counts down", () => {
    expect(slotClock(999_990n, START, N)).toEqual({ slot: null, startsIn: 10, slotEndsIn: 0, finished: false });
  });
  it("slot boundaries are [start + 10s, start + 10(s+1))", () => {
    expect(slotClock(START, START, N).slot).toBe(0);
    expect(slotClock(START + 9n, START, N)).toMatchObject({ slot: 0, slotEndsIn: 1 });
    expect(slotClock(START + 10n, START, N)).toMatchObject({ slot: 1, slotEndsIn: 10 });
  });
  it("after the last slot: finished", () => {
    expect(slotClock(START + BigInt(N * 10), START, N)).toMatchObject({ slot: null, finished: true });
  });
});

describe("useStageBeacon", () => {
  beforeEach(() => {
    time.current = { now: 0n, offset: 0, skewWarning: false, ready: false };
  });

  it("follows chain time, not the device clock, when the device is 40 s slow", () => {
    // Device clock reads START + 15 (slot 1) but the chain is 40 s ahead → chain time START + 55 (slot 5).
    time.current = chainTimeFor(Number(START) + 15, 40);
    const { result } = renderHook(() => useStageBeacon({ contestId: 2n, chain, start: START, length: N }));
    expect(result.current.slot).toBe(5);
    expect(result.current.skewWarning).toBe(true);
    expect(result.current.token).toBe(tokenForSlot(chain, 5));
    expect(decodePayload(result.current.payload!)).toEqual({ contestId: 2, slot: 5, token: tokenForSlot(chain, 5) });
    expect(result.current.qrText?.startsWith("arena:b1:")).toBe(true);
    expect(decodePayload(result.current.qrText!)).toEqual({ contestId: 2, slot: 5, token: tokenForSlot(chain, 5) });
    expect(result.current.payloadHex).toMatch(/^0x01000000020000000[0-9a-f]{33}$/);
  });

  it("a device clock 40 s fast is pulled back to the chain", () => {
    time.current = chainTimeFor(Number(START) + 95, -40);
    const { result } = renderHook(() => useStageBeacon({ contestId: 2n, chain, start: START, length: N }));
    expect(result.current.slot).toBe(5);
    expect(result.current.skewWarning).toBe(true);
  });

  it("small skew: no warning, payload object stable within a slot and new on the next slot", () => {
    time.current = chainTimeFor(Number(START) + 21, 3);
    const { result, rerender } = renderHook(() => useStageBeacon({ contestId: 2n, chain, start: START, length: N }));
    expect(result.current.slot).toBe(2);
    expect(result.current.skewWarning).toBe(false);
    const first = result.current.payload;
    time.current = chainTimeFor(Number(START) + 25, 3);
    rerender();
    expect(result.current.slot).toBe(2);
    expect(result.current.payload).toBe(first);
    time.current = chainTimeFor(Number(START) + 27, 3);
    rerender();
    expect(result.current.slot).toBe(3);
    expect(result.current.payload).not.toBe(first);
  });

  it("no payload until mounted, the chain is built, or the slot exists", () => {
    const { result, rerender } = renderHook((p: { chain: readonly `0x${string}`[] | null }) =>
      useStageBeacon({ contestId: 2n, chain: p.chain, start: START, length: N }),
    { initialProps: { chain: chain as readonly `0x${string}`[] | null } });
    expect(result.current.payload).toBeNull(); // now = 0n (not mounted)
    time.current = chainTimeFor(Number(START) + 5, 0);
    rerender({ chain: null });
    expect(result.current.slot).toBe(0);
    expect(result.current.payload).toBeNull();
    time.current = chainTimeFor(Number(START) - 30, 0);
    rerender({ chain });
    expect(result.current).toMatchObject({ slot: null, startsIn: 30, payload: null });
  });
});
