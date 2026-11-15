import { getAddress, type Address } from "viem";

export type GatekeeperLog = {
  args: { gatekeeper?: Address; allowed?: boolean };
  blockNumber?: bigint | null;
  logIndex?: number | null;
};

export type GatekeeperSet = { active: Address[]; revoked: Address[] };

/** Replays `GatekeeperSet` logs in chain order; the last event per address wins. */
export function reduceGatekeepers(logs: readonly GatekeeperLog[]): GatekeeperSet {
  const ordered = [...logs].sort((a, b) => {
    const blocks = Number((a.blockNumber ?? 0n) - (b.blockNumber ?? 0n));
    return blocks !== 0 ? blocks : (a.logIndex ?? 0) - (b.logIndex ?? 0);
  });
  const state = new Map<string, { address: Address; allowed: boolean }>();
  for (const log of ordered) {
    const { gatekeeper, allowed } = log.args;
    if (!gatekeeper || allowed === undefined) continue;
    const address = getAddress(gatekeeper);
    // Re-insert so the list keeps "most recently changed last".
    state.delete(address.toLowerCase());
    state.set(address.toLowerCase(), { address, allowed });
  }
  const all = [...state.values()];
  return {
    active: all.filter((g) => g.allowed).map((g) => g.address),
    revoked: all.filter((g) => !g.allowed).map((g) => g.address),
  };
}

/** Pulls a wallet address out of whatever a QR code or paste contains (plain, `ethereum:0x…`, URL). */
export function extractAddress(text: string): Address | null {
  const m = /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/.exec(text);
  if (!m) return null;
  try {
    return getAddress(m[0]);
  } catch {
    return null;
  }
}
