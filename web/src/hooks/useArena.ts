"use client";

import { usePublicClient } from "wagmi";
import { arenaAddress } from "@/config/contracts";
import { targetChain } from "@/config/network";

/** The target chain, the Arena address on it (if deployed) and a public client for reads. */
export function useArena() {
  const chainId = targetChain.id;
  const client = usePublicClient({ chainId });
  const address = arenaAddress(chainId);
  return { chainId, address, deployed: address !== undefined, client };
}
