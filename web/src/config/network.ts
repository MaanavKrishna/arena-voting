import { foundry, sepolia } from "viem/chains";
import type { Chain } from "viem";
import { env } from "./env";

/**
 * The ONLY place a network is chosen. Everything else (wagmi config, hooks, copy, explorer links)
 * reads from here, so a later network phase is a change to this file and `config/contracts.ts`.
 */

const LOCAL_RPC_URL = "http://127.0.0.1:8545";

export function buildNetwork(opts: { anvil: boolean; sepoliaRpcUrl?: string }) {
  const targetChain: Chain = opts.anvil ? foundry : sepolia;
  const chains = (opts.anvil ? [foundry, sepolia] : [sepolia]) as readonly [Chain, ...Chain[]];
  const isLocal = targetChain.id === foundry.id;

  return {
    targetChain,
    chains,
    isLocal,
    /** True while only test networks are configured. Drives the "Testnet" badge. */
    isTestnet: Boolean(targetChain.testnet) || isLocal,
    /** What amounts are called in copy. */
    currencyLabel: isLocal ? "Test ETH" : `${targetChain.name} ETH`,
    chainName: targetChain.name,
    rpcUrl(chainId: number): string | undefined {
      if (chainId === foundry.id) return LOCAL_RPC_URL;
      if (chainId === sepolia.id) return opts.sepoliaRpcUrl;
      return undefined;
    },
    /** `null` when the target chain has no explorer (local). */
    explorerTxUrl(hash: string): string | null {
      const base = chainExplorer(targetChain);
      return base ? `${base}/tx/${hash}` : null;
    },
    explorerAddressUrl(address: string): string | null {
      const base = chainExplorer(targetChain);
      return base ? `${base}/address/${address}` : null;
    },
  };
}

function chainExplorer(chain: Chain): string | null {
  if (chain.id === foundry.id) return null;
  return chain.blockExplorers?.default.url.replace(/\/$/, "") ?? null;
}

const network = buildNetwork({
  anvil: env.NEXT_PUBLIC_ENABLE_ANVIL,
  sepoliaRpcUrl: env.NEXT_PUBLIC_SEPOLIA_RPC_URL,
});

/**
 * E2E test mode. It swaps the wallet for a mock, accepts the public Anvil dev keys, reads metadata
 * from a local stand-in and exposes test hooks on `window`, so it must only ever run against the
 * local chain. Turning the flag on for any other target, or on a production deployment, stops the
 * app at config load rather than shipping those paths.
 */
export function resolveE2E(o: { e2e: boolean; isLocal: boolean; vercelEnv?: string }): boolean {
  if (!o.e2e) return false;
  if (!o.isLocal) {
    throw new Error("NEXT_PUBLIC_E2E=1 needs the local chain (NEXT_PUBLIC_ENABLE_ANVIL=1). Turn E2E mode off.");
  }
  if (o.vercelEnv === "production") {
    throw new Error("NEXT_PUBLIC_E2E=1 is not allowed on a production deployment.");
  }
  return true;
}

/** The single switch for every E2E-only path (mock wallet, dev keys, IPFS stand-in, test hooks). */
export const isE2E = resolveE2E({
  e2e: env.NEXT_PUBLIC_E2E,
  isLocal: network.isLocal,
  vercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL_ENV,
});

export const {
  targetChain,
  chains,
  isTestnet,
  currencyLabel,
  chainName,
  rpcUrl,
  explorerTxUrl,
  explorerAddressUrl,
} = network;
