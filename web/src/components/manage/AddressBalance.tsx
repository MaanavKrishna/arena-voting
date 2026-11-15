"use client";

import { useBalance } from "wagmi";
import { isAddress } from "viem";
import { currencyLabel, targetChain } from "@/config/network";
import { formatEth } from "@/lib/format";

/** The live balance of an address on the target chain; empty until the address is valid. */
export function useAddressBalance(address: string | undefined) {
  const valid = !!address && isAddress(address, { strict: false });
  return useBalance({
    address: valid ? (address as `0x${string}`) : undefined,
    chainId: targetChain.id,
    query: { enabled: valid, refetchInterval: 8_000 },
  });
}

export function AddressBalance({ address, className }: { address: string | undefined; className?: string }) {
  const { data, isPending } = useAddressBalance(address);
  if (!address || !isAddress(address, { strict: false })) return null;
  return (
    <span className={className}>
      {isPending || !data ? "Checking balance…" : `${formatEth(data.value)} ${currencyLabel}`}
    </span>
  );
}
