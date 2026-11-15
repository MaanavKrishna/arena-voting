import { describe, expect, it } from "vitest";
import { keccak256, slice, type Hex } from "viem";
import {
  MAX_FUTURE_SKEW,
  MAX_HASH_STEPS,
  MAX_TOKEN_AGE,
  SLOT_SECONDS,
  anchorOf,
  buildChain,
  checkToken,
  nextLink,
  slotAt,
  tokenForSlot,
  type BeaconState,
} from "./chain";

const SEED: Hex = keccak256("0x1234");
const B = (n: number): bigint => BigInt(n);

function refNext(x: Hex): Hex {
  return slice(keccak256(x), 0, 16);
}

function stateFor(length: number, start = 1000, cachedIndex?: number): BeaconState {
  const chain = buildChain(SEED, length);
  const ci = cachedIndex ?? length;
  return {
    anchor: anchorOf(chain),
    start: B(start),
    length,
    rotation: 1,
    cachedIndex: ci,
    cachedLink: chain[ci],
  };
}

describe("constants", () => {
  it("match the contract", () => {
    expect(SLOT_SECONDS).toBe(10);
    expect(MAX_TOKEN_AGE).toBe(120);
    expect(MAX_FUTURE_SKEW).toBe(30);
    expect(MAX_HASH_STEPS).toBe(4096);
  });
});

describe("buildChain", () => {
  it("has N+1 elements of 16 bytes", () => {
    const chain = buildChain(SEED, 5);
    expect(chain).toHaveLength(6);
    for (const c of chain) expect(c).toMatch(/^0x[0-9a-f]{32}$/);
  });

  it("c[0] hashes the 32-byte seed and c[k+1] = next(c[k])", () => {
    const chain = buildChain(SEED, 5);
    expect(chain[0]).toBe(slice(keccak256(SEED), 0, 16));
    for (let k = 0; k < 5; k++) {
      expect(chain[k + 1]).toBe(refNext(chain[k]));
      expect(nextLink(chain[k])).toBe(chain[k + 1]);
    }
  });

  it("rejects bad seeds and lengths", () => {
    expect(() => buildChain("0x1234", 5)).toThrow();
    expect(() => buildChain(SEED, 0)).toThrow();
    expect(() => buildChain(SEED, 1.5)).toThrow();
    expect(() => buildChain(SEED, 100_001)).toThrow();
  });

  it("builds 60,000 links in under 2 s", () => {
    const t0 = performance.now();
    const chain = buildChain(SEED, 60_000);
    const ms = performance.now() - t0;
    expect(chain).toHaveLength(60_001);
    expect(ms).toBeLessThan(2000);
  });
});

describe("tokenForSlot / anchorOf", () => {
  it("token for slot s is chain[len - 2 - s]", () => {
    const chain = buildChain(SEED, 20);
    expect(anchorOf(chain)).toBe(chain[20]);
    expect(tokenForSlot(chain, 0)).toBe(chain[19]);
    expect(tokenForSlot(chain, 19)).toBe(chain[0]);
    expect(tokenForSlot(chain, 7)).toBe(chain[chain.length - 2 - 7]);
  });

  it("throws out of range", () => {
    const chain = buildChain(SEED, 20);
    expect(() => tokenForSlot(chain, 20)).toThrow();
    expect(() => tokenForSlot(chain, -1)).toThrow();
  });
});

describe("slotAt", () => {
  const start = B(1000);
  it("floors to 10 s slots", () => {
    expect(slotAt(start, B(1000))).toBe(0);
    expect(slotAt(start, B(1009))).toBe(0);
    expect(slotAt(start, B(1010))).toBe(1);
    expect(slotAt(start, B(1095))).toBe(9);
  });
  it("is null before start", () => {
    expect(slotAt(start, B(999))).toBeNull();
  });
  it("is null past the chain when length is given", () => {
    expect(slotAt(start, B(1199), 20)).toBe(19);
    expect(slotAt(start, B(1200), 20)).toBeNull();
  });
});

describe("checkToken", () => {
  const LEN = 20;
  const START = 1000;
  const chain = buildChain(SEED, LEN);
  const s = (): BeaconState => stateFor(LEN, START);
  const tok = (slot: number): Hex => tokenForSlot(chain, slot);
  const slotStart = (slot: number): bigint => B(START + slot * 10);
  const slotEnd = (slot: number): bigint => slotStart(slot) + B(10);

  it("accepts the current slot's token", () => {
    expect(checkToken(s(), 3, tok(3), slotStart(3) + B(2), true)).toBe("Ok");
  });

  it("NotSet when anchor is zero", () => {
    const st: BeaconState = { ...s(), anchor: "0x00000000000000000000000000000000" };
    expect(checkToken(st, 3, tok(3), slotStart(3), true)).toBe("NotSet");
  });

  it("SlotOutOfRange when slot >= length", () => {
    expect(checkToken(s(), LEN, tok(3), slotStart(3), true)).toBe("SlotOutOfRange");
    expect(checkToken(s(), LEN - 1, tok(LEN - 1), slotStart(LEN - 1), true)).toBe("Ok");
  });

  it("future boundary: slotStart-30 ok, -31 expired", () => {
    expect(checkToken(s(), 5, tok(5), slotStart(5) - B(30), true)).toBe("Ok");
    expect(checkToken(s(), 5, tok(5), slotStart(5) - B(31), true)).toBe("Expired");
  });

  it("age boundary: slotEnd+120 ok, +121 expired", () => {
    expect(checkToken(s(), 5, tok(5), slotEnd(5) + B(120), true)).toBe("Ok");
    expect(checkToken(s(), 5, tok(5), slotEnd(5) + B(121), true)).toBe("Expired");
  });

  it("requireFresh = false skips the window", () => {
    expect(checkToken(s(), 5, tok(5), slotEnd(5) + B(100000), false)).toBe("Ok");
    expect(checkToken(s(), 5, tok(5), B(0), false)).toBe("Ok");
  });

  it("Invalid for a wrong token", () => {
    expect(checkToken(s(), 5, tok(6), slotStart(5), true)).toBe("Invalid");
    expect(checkToken(s(), 5, "0x1234", slotStart(5), true)).toBe("Invalid");
  });

  it("newer-than-cache token is hashed forward to the cache", () => {
    // cache at index LEN (the anchor); token for slot 5 has idx 14 -> 6 steps
    const r = checkToken(s(), 5, tok(5), slotStart(5), true);
    expect(r).toBe("Ok");
  });

  it("older-than-cache token is derived from the cached link", () => {
    // cache sits at slot 10 (idx 9); slot 4 has idx 15 -> 6 steps forward from cache
    const st = stateFor(LEN, START, 9);
    expect(checkToken(st, 4, tok(4), slotStart(4), true)).toBe("Ok");
    expect(checkToken(st, 4, tok(5), slotStart(4), true)).toBe("Invalid");
    // same age compares directly
    expect(checkToken(st, 10, tok(10), slotStart(10), true)).toBe("Ok");
  });

  it("GapTooLarge past 4096 steps in either direction", () => {
    const L = 5000;
    const big = buildChain(SEED, L);
    const mk = (ci: number): BeaconState => ({
      anchor: big[L],
      start: B(0),
      length: L,
      rotation: 1,
      cachedIndex: ci,
      cachedLink: big[ci],
    });
    const T = (slot: number): Hex => tokenForSlot(big, slot);
    const now = B(1_000_000);
    // newer: cache at anchor (idx 5000), slot 0 -> idx 4999 (1 step)
    expect(checkToken(mk(L), 0, T(0), now, false)).toBe("Ok");
    // slot 903 -> idx 4096 -> 904 steps; slot 4999 -> idx 0 -> 5000 steps
    expect(checkToken(mk(L), 4999, T(4999), now, false)).toBe("GapTooLarge");
    // exactly 4096 steps: idx = 5000 - 4096 = 904 -> slot = 5000-1-904 = 4095
    expect(checkToken(mk(L), 4095, T(4095), now, false)).toBe("Ok");
    expect(checkToken(mk(L), 4094, T(4094), now, false)).toBe("Ok");
    expect(checkToken(mk(L), 4096, T(4096), now, false)).toBe("GapTooLarge");
    // older direction: cache at idx 0, slot 0 -> idx 4999 -> 4999 steps
    expect(checkToken(mk(0), 0, T(0), now, false)).toBe("GapTooLarge");
    // cache at idx 903, slot 0 -> idx 4999 -> 4096 steps ok
    expect(checkToken(mk(903), 0, T(0), now, false)).toBe("Ok");
    expect(checkToken(mk(902), 0, T(0), now, false)).toBe("GapTooLarge");
  });
});
