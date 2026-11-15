import { bytesToHex, hexToBytes, isHex, keccak256, size, type Hex } from "viem";

// Mirrors contracts/src/lib/BeaconChain.sol. See docs/contracts.md "BeaconChain library".
export const SLOT_SECONDS = 10;
export const MAX_TOKEN_AGE = 120;
export const MAX_FUTURE_SKEW = 30;
export const MAX_HASH_STEPS = 4096;
export const MAX_CHAIN_LENGTH = 100_000;

/** Same order as the Solidity `BeaconStatus` enum (index = on-chain uint8). */
export const BEACON_STATUSES = [
  "Ok",
  "NotSet",
  "SlotOutOfRange",
  "Expired",
  "GapTooLarge",
  "Invalid",
] as const;
export type BeaconStatus = (typeof BEACON_STATUSES)[number];

export function beaconStatusFromIndex(index: number): BeaconStatus {
  const s = BEACON_STATUSES[index];
  if (s === undefined) throw new RangeError(`unknown BeaconStatus ${index}`);
  return s;
}

export type BeaconState = {
  anchor: Hex;
  start: bigint;
  length: number;
  rotation: number;
  cachedIndex: number;
  cachedLink: Hex;
};

const SLOT_SECONDS_BIG = BigInt(SLOT_SECONDS);
const MAX_TOKEN_AGE_BIG = BigInt(MAX_TOKEN_AGE);
const MAX_FUTURE_SKEW_BIG = BigInt(MAX_FUTURE_SKEW);

function nextBytes(x: Uint8Array): Uint8Array {
  return keccak256(x, "bytes").slice(0, 16);
}

/** next(x) = bytes16(keccak256(x)) over exactly 16 bytes. */
export function nextLink(link: Hex): Hex {
  return bytesToHex(nextBytes(hexToBytes(link)));
}

/** Returns c[0..N] (N + 1 elements). The anchor is the last element. */
export function buildChain(seed: Hex, length: number): Hex[] {
  if (!isHex(seed) || size(seed) !== 32) throw new RangeError("seed must be 32 bytes");
  if (!Number.isInteger(length) || length < 1 || length > MAX_CHAIN_LENGTH) {
    throw new RangeError(`chain length must be an integer in 1..${MAX_CHAIN_LENGTH}`);
  }
  const out: Hex[] = new Array<Hex>(length + 1);
  let cur = nextBytes(hexToBytes(seed));
  out[0] = bytesToHex(cur);
  for (let k = 1; k <= length; k++) {
    cur = nextBytes(cur);
    out[k] = bytesToHex(cur);
  }
  return out;
}

export function anchorOf(chain: readonly Hex[]): Hex {
  return chain[chain.length - 1];
}

/** Token for slot s (0 <= s < N) is c[N-1-s] = chain[chain.length - 2 - s]. */
export function tokenForSlot(chain: readonly Hex[], slot: number): Hex {
  const n = chain.length - 1;
  if (!Number.isInteger(slot) || slot < 0 || slot >= n) {
    throw new RangeError(`slot ${slot} out of range 0..${n - 1}`);
  }
  return chain[chain.length - 2 - slot];
}

/** Slot index for a chain time, or null before `start` / past the chain (when `length` is given). */
export function slotAt(start: bigint, now: bigint, length?: number): number | null {
  if (now < start) return null;
  const slot = (now - start) / SLOT_SECONDS_BIG;
  if (slot > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const n = Number(slot);
  if (length !== undefined && n >= length) return null;
  return n;
}

function isZero16(h: Hex): boolean {
  return /^0x0*$/.test(h);
}

function hashForward(link: Hex, steps: number): Hex | null {
  if (!isHex(link) || size(link) !== 16) return null;
  let cur = hexToBytes(link);
  for (let i = 0; i < steps; i++) cur = nextBytes(cur);
  return bytesToHex(cur);
}

/** Port of `BeaconChain.check`. Never throws; returns the status and the chain index. */
export function checkTokenDetailed(
  state: BeaconState,
  slot: number,
  token: Hex,
  now: bigint,
  requireFresh: boolean,
): { status: BeaconStatus; idx: number } {
  const fail = (status: BeaconStatus): { status: BeaconStatus; idx: number } => ({
    status,
    idx: 0,
  });
  if (isZero16(state.anchor)) return fail("NotSet");
  if (!Number.isInteger(slot) || slot < 0 || slot >= state.length) return fail("SlotOutOfRange");

  if (requireFresh) {
    const slotStart = state.start + BigInt(slot) * SLOT_SECONDS_BIG;
    const slotEnd = slotStart + SLOT_SECONDS_BIG;
    if (slotStart > now + MAX_FUTURE_SKEW_BIG || now > slotEnd + MAX_TOKEN_AGE_BIG) {
      return fail("Expired");
    }
  }

  const idx = state.length - 1 - slot;
  const tokenNorm = token.toLowerCase();
  if (idx < state.cachedIndex) {
    const steps = state.cachedIndex - idx;
    if (steps > MAX_HASH_STEPS) return { status: "GapTooLarge", idx };
    const h = hashForward(token, steps);
    return { status: h !== null && h === state.cachedLink.toLowerCase() ? "Ok" : "Invalid", idx };
  }
  const steps = idx - state.cachedIndex;
  if (steps > MAX_HASH_STEPS) return { status: "GapTooLarge", idx };
  const h = hashForward(state.cachedLink, steps);
  return { status: h !== null && h === tokenNorm ? "Ok" : "Invalid", idx };
}

export function checkToken(
  state: BeaconState,
  slot: number,
  token: Hex,
  now: bigint,
  requireFresh: boolean,
): BeaconStatus {
  return checkTokenDetailed(state, slot, token, now, requireFresh).status;
}
