import { isAddress } from "viem";

/** Contest ids travel as strings across the server/client boundary; hooks accept either. */
export type ContestId = string | bigint;

export function parseContestId(id: ContestId | null | undefined): bigint | undefined {
  if (id === null || id === undefined) return undefined;
  if (typeof id === "bigint") return id > 0n ? id : undefined;
  return /^\d+$/.test(id) && BigInt(id) > 0n ? BigInt(id) : undefined;
}

/** Query keys. Everything about one contest sits under `contest(chainId, id)` so one invalidate refreshes it all. */
export const arenaKeys = {
  root: (chainId: number) => ["arena", chainId] as const,
  contests: (chainId: number) => ["arena", chainId, "contests"] as const,
  contest: (chainId: number, id: bigint) => ["arena", chainId, "contest", id.toString()] as const,
  contestView: (chainId: number, id: bigint) => [...arenaKeys.contest(chainId, id), "view"] as const,
  entries: (chainId: number, id: bigint) => [...arenaKeys.contest(chainId, id), "entries"] as const,
  voter: (chainId: number, id: bigint, account: string) =>
    [...arenaKeys.contest(chainId, id), "voter", account.toLowerCase()] as const,
  logs: (chainId: number, event: string, args: string) => ["arena", chainId, "logs", event, args] as const,
};

/** Reverts are answers, not outages: don't retry them. */
export function retryUnlessRevert(count: number, err: unknown): boolean {
  if (count >= 2) return false;
  let cur: unknown = err;
  for (let i = 0; i < 6 && cur && typeof cur === "object"; i++) {
    const name = (cur as { name?: unknown }).name;
    if (name === "ContractFunctionRevertedError" || name === "ContractFunctionExecutionError") {
      const c = (cur as { cause?: unknown }).cause;
      if (name === "ContractFunctionRevertedError" || (c && (c as { name?: unknown }).name === "ContractFunctionRevertedError")) {
        return false;
      }
    }
    cur = (cur as { cause?: unknown }).cause;
  }
  return true;
}

export function isAddressLike(v: string | undefined): v is `0x${string}` {
  return !!v && isAddress(v, { strict: false });
}
