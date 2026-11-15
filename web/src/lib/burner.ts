import {
  createWalletClient,
  http,
  isHex,
  nonceManager,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PrivateKeyAccount,
  type WalletClient,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { isE2E, rpcUrl, targetChain } from "@/config/network";

/**
 * Addresses of Anvil's default dev accounts 0..2 (public). The E2E mock wallet connects as these;
 * their keys live in `anvilKeys.ts` and are loaded only in E2E mode.
 */
export const ANVIL_ADDRESSES: readonly Address[] = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
];

/**
 * The Anvil dev keys, or null outside E2E mode. The env is read literally here (not through
 * `isE2E`) so the bundler can drop this branch, and the `anvilKeys` chunk with it, from any build
 * that isn't an E2E build.
 */
export async function loadAnvilKeys(): Promise<readonly Hex[] | null> {
  if (process.env.NEXT_PUBLIC_E2E === "1" && process.env.NEXT_PUBLIC_ENABLE_ANVIL === "1") {
    return (await import("./anvilKeys")).ANVIL_KEYS;
  }
  return null;
}

export type BurnerKind = "stage" | "gate";

export type Burner = {
  /** The raw key, so the UI can show a backup/fund address or export it. Treat as a secret. */
  privateKey: Hex;
  account: PrivateKeyAccount;
  /** True when the key came from the E2E override rather than from storage. */
  isE2E: boolean;
};

export type BurnerOptions = {
  storage?: Pick<Storage, "getItem" | "setItem">;
  /** Query string (with or without the leading "?"); defaults to the page's own. */
  search?: string;
  /** Defaults to `isE2E`. The `?e2eBurner=n` override works only when true. */
  e2e?: boolean;
  /** Where the dev keys come from; defaults to `loadAnvilKeys` (tests inject their own). */
  anvilKeys?: () => Promise<readonly Hex[] | null>;
};

export function burnerStorageKey(kind: BurnerKind, chainId: number, contestId: bigint | number | string): string {
  return `arena:${kind}:${chainId}:${contestId}`;
}

/** Index from `?e2eBurner=n` (an Anvil account), or null when absent or out of range. */
export function e2eIndex(search: string, param: string): number | null {
  const v = new URLSearchParams(search).get(param);
  if (v === null || !/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n < ANVIL_ADDRESSES.length ? n : null;
}

function toAccount(key: Hex): PrivateKeyAccount {
  // The nonce manager keeps a stage/gate device sending back-to-back transactions without
  // waiting for each to be mined.
  return privateKeyToAccount(key, { nonceManager });
}

/**
 * The device's burner key for a stage or gate, created on first use and kept in localStorage.
 * Browser-only: call it from an effect or event handler, never during server render.
 */
export async function getOrCreateBurner(
  kind: BurnerKind,
  chainId: number,
  contestId: bigint | number | string,
  opts: BurnerOptions = {},
): Promise<Burner> {
  const e2e = opts.e2e ?? isE2E;
  if (e2e) {
    const search = opts.search ?? (typeof window !== "undefined" ? window.location.search : "");
    const idx = e2eIndex(search, "e2eBurner");
    const keys = idx !== null ? await (opts.anvilKeys ?? loadAnvilKeys)() : null;
    if (idx !== null && keys) {
      const privateKey = keys[idx];
      return { privateKey, account: toAccount(privateKey), isE2E: true };
    }
  }

  const storage = opts.storage ?? window.localStorage;
  const name = burnerStorageKey(kind, chainId, contestId);
  const stored = storage.getItem(name);
  if (stored && isHex(stored) && stored.length === 66) {
    return { privateKey: stored, account: toAccount(stored), isE2E: false };
  }
  const privateKey = generatePrivateKey();
  storage.setItem(name, privateKey);
  return { privateKey, account: toAccount(privateKey), isE2E: false };
}

/** A wallet client that signs locally with the burner key and sends through the target chain's RPC. */
export function burnerWalletClient(account: Account, chain: Chain = targetChain): WalletClient {
  return createWalletClient({ account, chain, transport: http(rpcUrl(chain.id)) });
}
