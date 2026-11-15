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
