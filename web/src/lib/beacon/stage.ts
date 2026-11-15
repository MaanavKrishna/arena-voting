import { isHex, size, type Address, type Hex } from "viem";
import { z } from "zod";
import { MAX_CHAIN_LENGTH, MAX_HASH_STEPS, SLOT_SECONDS, anchorOf, checkToken, tokenForSlot } from "./chain";

/**
 * Pure Stage logic: set-up vs recovery (docs/ground-presence.md "Setting up vs recovering"),
 * chain sizing, advanceBeacon hop planning, seed storage keys and the backup file.
 */

/** The beacon fields of `ContestView`, as the Stage needs them. */
export type OnChainBeacon = {
  anchor: Hex;
  start: bigint;
  length: number;
  rotation: number;
  /** Chain index of the newest verified link (= length when nothing is verified yet). */
  cachedIndex: number;
};

export function beaconFromContest(v: {
  beaconAnchor: Hex;
  beaconStart: bigint;
  beaconLength: number;
  beaconRotation: number;
  beaconCachedIndex: number;
}): OnChainBeacon {
  return {
    anchor: v.beaconAnchor,
    start: v.beaconStart,
    length: v.beaconLength,
    rotation: v.beaconRotation,
    cachedIndex: v.beaconCachedIndex,
  };
}

export function isBeaconSet(b: Pick<OnChainBeacon, "anchor">): boolean {
  return !/^0x0*$/.test(b.anchor);
}

// ---- set-up vs recovery ---------------------------------------------------------------------

export type SetupDecision =
  /** Anywhere contest: no beacon at all. */
  | { kind: "not-required" }
  /** Voting is over: setBeacon/advanceBeacon would revert, the Stage only shows results. */
  | { kind: "ended" }
  /** Never set: sign `Rotation: 1`, size a chain, call setBeacon. */
  | { kind: "setup"; rotation: 1 }
  /** Set, and this device stored the seed for the on-chain rotation: rebuild, compare, no transaction. */
  | { kind: "rebuild-stored"; rotation: number; seed: Hex }
  /** Set, new or crashed device: sign with the on-chain rotation, rebuild, compare. */
  | { kind: "recover-sign"; rotation: number };

export function setupDecision(input: {
  /** `Presence` enum: 0 Anywhere, 1 Room, 2 Gated. */
  presence: number;
  votingEnd: bigint;
  /** Chain time. */
  now: bigint;
  beacon: OnChainBeacon;
  /** Seed this device stored for `beacon.rotation`, if any. */
  storedSeed: Hex | null;
}): SetupDecision {
  if (input.presence === 0) return { kind: "not-required" };
  if (input.now >= input.votingEnd) return { kind: "ended" };
  if (!isBeaconSet(input.beacon)) return { kind: "setup", rotation: 1 };
  if (input.storedSeed) return { kind: "rebuild-stored", rotation: input.beacon.rotation, seed: input.storedSeed };
  return { kind: "recover-sign", rotation: input.beacon.rotation };
}

/** After rebuilding a chain from on-chain start/length: does it end in the on-chain anchor? */
export function rebuildVerdict(chain: readonly Hex[], onChain: Pick<OnChainBeacon, "anchor" | "length">): "resume" | "mismatch" {
  if (chain.length !== onChain.length + 1) return "mismatch";
  return anchorOf(chain).toLowerCase() === onChain.anchor.toLowerCase() ? "resume" : "mismatch";
}

// ---- chain sizing ---------------------------------------------------------------------------

const SLOT = BigInt(SLOT_SECONDS);

/**
 * `start = floor((max(now, votingStart) - 60) / 10) * 10`; `length = ceil((votingEnd - start) / 10) + 6`.
 * Only for a new chain (first set-up or rotation). Throws when voting has ended or the chain would
 * exceed the contract's limit.
 */
export function planChain(input: { chainNow: bigint; votingStart: bigint; votingEnd: bigint }): {
  start: bigint;
  length: number;
} {
  if (input.chainNow >= input.votingEnd) throw new RangeError("voting has ended");
  const from = (input.chainNow > input.votingStart ? input.chainNow : input.votingStart) - 60n;
  const start = from <= 0n ? 0n : (from / SLOT) * SLOT;
  const span = input.votingEnd - start;
  const length = Number((span + SLOT - 1n) / SLOT) + 6;
  if (length > MAX_CHAIN_LENGTH) throw new RangeError("voting window too long for one beacon chain");
  return { start, length };
}

// ---- advanceBeacon hops ---------------------------------------------------------------------

export type BeaconHop = { slot: number; token: Hex };

/**
 * The `advanceBeacon` calls that bring the on-chain cache up to `currentSlot`: none when the cache
 * is already there, otherwise hops of at most `MAX_HASH_STEPS` links. Each hop is checked locally
 * with `checkToken` (no freshness, like the contract), so a hop that would revert is never planned.
 */
export function planHops(chain: readonly Hex[], onChain: OnChainBeacon, currentSlot: number): BeaconHop[] {
  const n = onChain.length;
  if (chain.length !== n + 1 || !Number.isInteger(currentSlot) || currentSlot < 0 || currentSlot >= n) return [];
  const target = n - 1 - currentSlot;
  let cachedIndex = Math.min(onChain.cachedIndex, n);
  if (cachedIndex <= target) return [];

  const hops: BeaconHop[] = [];
  let cachedLink = chain[cachedIndex];
  while (cachedIndex > target) {
    const idx = Math.max(target, cachedIndex - MAX_HASH_STEPS);
    const slot = n - 1 - idx;
    const token = tokenForSlot(chain, slot);
    const state = { anchor: onChain.anchor, start: onChain.start, length: n, rotation: onChain.rotation, cachedIndex, cachedLink };
    if (checkToken(state, slot, token, 0n, false) !== "Ok") return hops;
    hops.push({ slot, token });
    cachedIndex = idx;
    cachedLink = token;
  }
  return hops;
}

/**
 * Sends planned hops strictly one after another: each `advanceBeacon` is simulated against the
 * state the previous hop left on chain, so `send` (simulate + sign + send) for hop N+1 only starts
 * once `confirm` says hop N was mined. Stops at the first failure. Returns the last hash.
 */
export async function sendHops<H>(
  hops: readonly BeaconHop[],
  io: { send: (hop: BeaconHop) => Promise<H>; confirm: (hash: H) => Promise<void> },
): Promise<H | undefined> {
  let last: H | undefined;
  for (const hop of hops) {
    last = await io.send(hop);
    await io.confirm(last);
  }
  return last;
}

/** The slot of the newest verified link, or null when nothing is verified yet. */
export function cachedSlot(onChain: Pick<OnChainBeacon, "length" | "cachedIndex">): number | null {
  if (onChain.cachedIndex >= onChain.length) return null;
  return onChain.length - 1 - onChain.cachedIndex;
}

// ---- seed storage + backup ------------------------------------------------------------------

type Ids = { chainId: number; arena: Address; contestId: bigint };

export function seedStorageKey(a: Ids & { rotation: number }): string {
  return `arena:beacon:${a.chainId}:${a.arena.toLowerCase()}:${a.contestId.toString()}:${a.rotation}`;
}

export type BeaconBackup = Ids & { seed: Hex; start: bigint; length: number; rotation: number };

export const BACKUP_VERSION = 1;

export function backupFileName(contestId: bigint): string {
  return `arena-beacon-${contestId.toString()}.json`;
}

export function serializeBackup(b: BeaconBackup): string {
  return JSON.stringify(
    {
      version: BACKUP_VERSION,
      chainId: b.chainId,
      contract: b.arena,
      contest: b.contestId.toString(),
      rotation: b.rotation,
      start: b.start.toString(),
      length: b.length,
      seed: b.seed,
    },
    null,
    2,
  );
}

const BackupSchema = z.object({
  version: z.literal(BACKUP_VERSION),
  chainId: z.number().int().positive(),
  contract: z.string().refine((s) => isHex(s) && size(s as Hex) === 20),
  contest: z.string().regex(/^\d+$/),
  rotation: z.number().int().positive(),
  start: z.string().regex(/^\d+$/),
  length: z.number().int().positive().max(MAX_CHAIN_LENGTH),
  seed: z.string().refine((s) => isHex(s) && size(s as Hex) === 32),
});

export type ParsedBackup = { ok: true; backup: BeaconBackup } | { ok: false; reason: "invalid" | "other-contest" };

/** Validates a backup file and checks it belongs to this chain, contract and contest. */
export function parseBackup(text: string, expected: Ids): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  const p = BackupSchema.safeParse(raw);
  if (!p.success) return { ok: false, reason: "invalid" };
  const d = p.data;
  if (
    d.chainId !== expected.chainId ||
    d.contract.toLowerCase() !== expected.arena.toLowerCase() ||
    BigInt(d.contest) !== expected.contestId
  ) {
    return { ok: false, reason: "other-contest" };
  }
  return {
    ok: true,
    backup: {
      chainId: d.chainId,
      arena: expected.arena,
      contestId: expected.contestId,
      seed: d.seed as Hex,
      start: BigInt(d.start),
      length: d.length,
      rotation: d.rotation,
    },
  };
}

/** What this device keeps in localStorage per rotation (the seed plus the chain shape it was made for). */
export type StoredSeed = { seed: Hex; start: string; length: number };

export function readStoredSeed(storage: Pick<Storage, "getItem">, key: string): StoredSeed | null {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<StoredSeed>;
    if (typeof v.seed === "string" && isHex(v.seed) && size(v.seed) === 32 && typeof v.start === "string" && typeof v.length === "number") {
      return { seed: v.seed, start: v.start, length: v.length };
    }
  } catch {
    // fall through
  }
  return null;
}
