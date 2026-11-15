import { describe, expect, it } from "vitest";
import { keccak256, type Hex } from "viem";
import { MAX_HASH_STEPS, anchorOf, buildChain, checkToken, tokenForSlot } from "./chain";
import {
  BACKUP_VERSION,
  backupFileName,
  beaconFromContest,
  isBeaconSet,
  parseBackup,
  planChain,
  planHops,
  rebuildVerdict,
  seedStorageKey,
  serializeBackup,
  setupDecision,
  type OnChainBeacon,
} from "./stage";

const ZERO16: Hex = "0x00000000000000000000000000000000";
const SEED: Hex = keccak256("0xbeef");
const ARENA = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const;

function beacon(over: Partial<OnChainBeacon> = {}): OnChainBeacon {
  return { anchor: ZERO16, start: 0n, length: 0, rotation: 0, cachedIndex: 0, ...over };
}

describe("setupDecision (docs/ground-presence.md set-up vs recovery table)", () => {
  const base = { presence: 1, votingEnd: 10_000n, now: 1_000n, storedSeed: null };

  it("Anywhere contests need no beacon", () => {
    expect(setupDecision({ ...base, presence: 0, beacon: beacon() })).toEqual({ kind: "not-required" });
  });

  it("after voting ends there is nothing to set up", () => {
    expect(setupDecision({ ...base, now: 10_000n, beacon: beacon() })).toEqual({ kind: "ended" });
  });

  it("never set → sign Rotation 1 and call setBeacon", () => {
    expect(setupDecision({ ...base, beacon: beacon() })).toEqual({ kind: "setup", rotation: 1 });
  });

  it("set + stored seed for that rotation → rebuild from the stored seed, no transaction", () => {
    const b = beacon({ anchor: "0x11111111111111111111111111111111", start: 900n, length: 100, rotation: 2, cachedIndex: 100 });
    expect(setupDecision({ ...base, beacon: b, storedSeed: SEED })).toEqual({ kind: "rebuild-stored", rotation: 2, seed: SEED });
  });

  it("set + nothing stored (new laptop) → sign with the on-chain rotation", () => {
    const b = beacon({ anchor: "0x11111111111111111111111111111111", start: 900n, length: 100, rotation: 3, cachedIndex: 100 });
    expect(setupDecision({ ...base, beacon: b })).toEqual({ kind: "recover-sign", rotation: 3 });
  });
});

describe("rebuildVerdict", () => {
  const chain = buildChain(SEED, 20);
  const onChain = beacon({ anchor: anchorOf(chain), start: 0n, length: 20, rotation: 1, cachedIndex: 20 });

  it("matching anchor resumes without a transaction", () => {
    expect(rebuildVerdict(chain, onChain)).toBe("resume");
  });
  it("a different anchor is a mismatch (never auto-setBeacon)", () => {
    expect(rebuildVerdict(buildChain(keccak256("0x01"), 20), onChain)).toBe("mismatch");
  });
  it("a wrong length is a mismatch", () => {
    expect(rebuildVerdict(buildChain(SEED, 21), onChain)).toBe("mismatch");
  });
  it("anchor comparison ignores hex case", () => {
    expect(rebuildVerdict(chain, { ...onChain, anchor: onChain.anchor.toUpperCase().replace("0X", "0x") as Hex })).toBe("resume");
  });
});

describe("planChain (chain sizing)", () => {
  it("before voting: starts a minute before voting opens, on a 10 s boundary", () => {
    // votingStart 10_005 → max(now, vs) - 60 = 9_945 → floor to 9_940
    const p = planChain({ chainNow: 5_000n, votingStart: 10_005n, votingEnd: 13_605n });
    expect(p.start).toBe(9_940n);
    // ceil((13_605 - 9_940) / 10) + 6 = 367 + 6
    expect(p.length).toBe(373);
  });

  it("during voting: starts a minute before now", () => {
    const p = planChain({ chainNow: 20_017n, votingStart: 10_000n, votingEnd: 30_000n });
    expect(p.start).toBe(19_950n);
    expect(p.length).toBe(Math.ceil((30_000 - 19_950) / 10) + 6);
  });

  it("a 7-day vote fits the contract limit", () => {
    const p = planChain({ chainNow: 0n, votingStart: 100n, votingEnd: 100n + 7n * 86_400n });
    // 7 days of 10 s slots + the 60 s lead + 6 spare links, far under MAX_CHAIN_LENGTH (100k)
    expect(p.length).toBe(60_480 + 6 + 6);
    expect(p.start).toBeLessThan(100n + 7n * 86_400n);
  });

  it("covers every slot up to votingEnd", () => {
    const p = planChain({ chainNow: 1_234n, votingStart: 1_000n, votingEnd: 2_000n });
    const lastSlotStart = p.start + BigInt(p.length - 1) * 10n;
    expect(lastSlotStart).toBeGreaterThanOrEqual(2_000n);
  });

  it("refuses when voting already ended", () => {
    expect(() => planChain({ chainNow: 3_000n, votingStart: 1_000n, votingEnd: 2_000n })).toThrow();
  });
});

describe("planHops (advanceBeacon bridging)", () => {
  const N = 10_000;
  const chain = buildChain(SEED, N);
  const onChain = (cachedIndex: number) =>
    beacon({ anchor: anchorOf(chain), start: 0n, length: N, rotation: 1, cachedIndex });

  it("nothing verified yet, slot 5 → one hop straight to the current slot", () => {
    const hops = planHops(chain, onChain(N), 5);
    expect(hops).toEqual([{ slot: 5, token: tokenForSlot(chain, 5) }]);
  });

  it("cache already at or past the current slot → no hop", () => {
    const idx = N - 1 - 40;
    expect(planHops(chain, onChain(idx), 40)).toEqual([]);
    expect(planHops(chain, onChain(idx), 30)).toEqual([]);
  });

  it("a long gap is bridged in hops of at most 4096 slots, each one valid in turn", () => {
    const current = 9_000; // cache at "nothing verified" (idx N) → target idx 999 → 9001 steps
    const hops = planHops(chain, onChain(N), current);
    expect(hops.length).toBe(3);
    expect(hops[hops.length - 1].slot).toBe(current);

    let cachedIndex = N;
    let cachedLink = chain[N];
    for (const h of hops) {
      const idx = N - 1 - h.slot;
      expect(cachedIndex - idx).toBeLessThanOrEqual(MAX_HASH_STEPS);
      const state = { anchor: anchorOf(chain), start: 0n, length: N, rotation: 1, cachedIndex, cachedLink };
      expect(checkToken(state, h.slot, h.token, 0n, false)).toBe("Ok");
      cachedIndex = idx;
      cachedLink = h.token;
    }
  });

  it("a gap of exactly 4096 is a single hop", () => {
    const hops = planHops(chain, onChain(N), 4095);
    expect(hops).toHaveLength(1);
  });

  it("out-of-range slots plan nothing", () => {
    expect(planHops(chain, onChain(N), N)).toEqual([]);
    expect(planHops(chain, onChain(N), -1)).toEqual([]);
  });
});

describe("seed storage and backups", () => {
  const ids = { chainId: 31337, arena: ARENA, contestId: 2n } as const;

  it("storage key is scoped to chain, contract, contest and rotation", () => {
    expect(seedStorageKey({ ...ids, rotation: 1 })).toBe(`arena:beacon:31337:${ARENA.toLowerCase()}:2:1`);
    expect(seedStorageKey({ ...ids, rotation: 2 })).not.toBe(seedStorageKey({ ...ids, rotation: 1 }));
  });

  it("backup round-trips and is checked against the contest", () => {
    const text = serializeBackup({ ...ids, seed: SEED, start: 9_940n, length: 373, rotation: 1 });
    expect(JSON.parse(text).version).toBe(BACKUP_VERSION);
    expect(parseBackup(text, ids)).toEqual({ ok: true, backup: { ...ids, seed: SEED, start: 9_940n, length: 373, rotation: 1 } });
    expect(parseBackup(text, { ...ids, contestId: 3n })).toEqual({ ok: false, reason: "other-contest" });
    expect(parseBackup("{nope", ids)).toEqual({ ok: false, reason: "invalid" });
    expect(parseBackup(JSON.stringify({ version: 1 }), ids)).toEqual({ ok: false, reason: "invalid" });
  });

  it("backup file name follows the spec", () => {
    expect(backupFileName(7n)).toBe("arena-beacon-7.json");
  });
});

describe("beaconFromContest", () => {
  it("maps the ContestView beacon fields", () => {
    const b = beaconFromContest({
      beaconAnchor: "0x11111111111111111111111111111111",
      beaconStart: 10n,
      beaconLength: 5,
      beaconRotation: 1,
      beaconCachedIndex: 5,
    });
    expect(b).toEqual({ anchor: "0x11111111111111111111111111111111", start: 10n, length: 5, rotation: 1, cachedIndex: 5 });
    expect(isBeaconSet(b)).toBe(true);
    expect(isBeaconSet({ ...b, anchor: ZERO16 })).toBe(false);
  });
});
