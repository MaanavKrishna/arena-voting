import {
  createWalletClient,
  http,
  isHex,
  nonceManager,
  type Account,
  type Chain,
  type Hex,
  type PrivateKeyAccount,
  type WalletClient,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { env } from "@/config/env";
import { rpcUrl, targetChain } from "@/config/network";

/**
 * Anvil's default dev accounts. These keys are public and well known (they appear in Foundry's
 * docs); they only ever hold test funds on a local chain.
 */
export const ANVIL_KEYS: readonly Hex[] = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
];

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
  /** Defaults to `NEXT_PUBLIC_E2E`. The `?e2eBurner=n` override works only when true. */
  e2e?: boolean;
};

export function burnerStorageKey(kind: BurnerKind, chainId: number, contestId: bigint | number | string): string {
  return `arena:${kind}:${chainId}:${contestId}`;
}

/** Index from `?e2eBurner=n` (an Anvil account), or null when absent or out of range. */
export function e2eIndex(search: string, param: string): number | null {
  const v = new URLSearchParams(search).get(param);
  if (v === null || !/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n < ANVIL_KEYS.length ? n : null;
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
export function getOrCreateBurner(
  kind: BurnerKind,
  chainId: number,
  contestId: bigint | number | string,
  opts: BurnerOptions = {},
): Burner {
  const e2e = opts.e2e ?? env.NEXT_PUBLIC_E2E;
  if (e2e) {
    const search = opts.search ?? (typeof window !== "undefined" ? window.location.search : "");
    const idx = e2eIndex(search, "e2eBurner");
    if (idx !== null) {
      const privateKey = ANVIL_KEYS[idx];
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
