export type BeaconHealthInput = {
  beaconAnchorSet: boolean;
  beaconStart: bigint;
  beaconLength: number;
  beaconCachedIndex: number;
  /** Chain time, unix seconds. */
  now: bigint;
};

export type BeaconHealth =
  | { state: "not-set" }
  /** Set, but no token has been verified on-chain yet. */
  | { state: "waiting" }
  | { state: "fresh" | "stale"; slot: number; verifiedAt: bigint };

export const SLOT_SECONDS = 10n;
/** The contract accepts tokens up to 120 s after their slot ends, so older than that is stale. */
export const FRESH_SECONDS = 130n;

/**
 * `beaconCachedIndex` is the chain index of the newest verified link (= `length` when nothing has
 * been verified yet); slot `s` has index `length - 1 - s`.
 */
export function beaconHealth(i: BeaconHealthInput): BeaconHealth {
  if (!i.beaconAnchorSet) return { state: "not-set" };
  if (i.beaconCachedIndex >= i.beaconLength) return { state: "waiting" };
  const slot = i.beaconLength - 1 - i.beaconCachedIndex;
  const verifiedAt = i.beaconStart + BigInt(slot) * SLOT_SECONDS;
  const age = i.now - verifiedAt;
  return { state: age <= FRESH_SECONDS ? "fresh" : "stale", slot, verifiedAt };
}
