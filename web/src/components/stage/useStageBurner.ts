"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { Address, Hash, Hex } from "viem";
import { arenaAbi } from "@/generated";
import { useArena } from "@/hooks/useArena";
import { arenaKeys } from "@/hooks/shared";
import { burnerWalletClient, getOrCreateBurner, type Burner } from "@/lib/burner";
import { planHops, type OnChainBeacon } from "@/lib/beacon/stage";
import { explainError } from "@/lib/errors";

/** How often the Stage pushes the on-chain cache forward (docs/ground-presence.md, D-14). */
export const ADVANCE_EVERY_MS = 60_000;
/** First push shortly after the beacon starts, so a long overnight gap is bridged right away. */
const FIRST_ADVANCE_MS = 3_000;

export type AdvanceState =
  | { status: "off" }
  | { status: "waiting" }
  | { status: "needs-funds" }
  | { status: "sending"; hops: number }
  | { status: "ok"; slot: number; at: number; hash: Hash }
  | { status: "up-to-date"; at: number }
  | { status: "error"; message: string; at: number };

/** The Stage's own key (localStorage), its balance, and the advanceBeacon loop. */
export function useStageBurner({
  contestId,
  chain,
  onChain,
  slot,
  enabled,
}: {
  contestId: bigint | undefined;
  chain: readonly Hex[] | null;
  onChain: OnChainBeacon | null;
  slot: number | null;
  /** Voting open, beacon active, toggle on. */
  enabled: boolean;
}) {
  const { client, chainId, address: arena } = useArena();
  const queryClient = useQueryClient();
  const [burner, setBurner] = useState<Burner | null>(null);
  const [advance, setAdvance] = useState<AdvanceState>({ status: "off" });

  useEffect(() => {
    if (contestId === undefined) return;
    // localStorage is browser-only: create the key after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBurner(getOrCreateBurner("stage", chainId, contestId));
  }, [chainId, contestId]);

  const address: Address | undefined = burner?.account.address;
  const balance = useQuery({
    queryKey: ["arena", chainId, "stage-burner-balance", address ?? ""],
    enabled: !!client && !!address,
    refetchInterval: 15_000,
    queryFn: () => client!.getBalance({ address: address! }),
  });

  // Latest inputs for the interval callback, without restarting the timer every second.
  const latest = useRef({ chain, onChain, slot, balance: balance.data });
  useEffect(() => {
    latest.current = { chain, onChain, slot, balance: balance.data };
  });

  const inFlight = useRef(false);
  useEffect(() => {
    if (!enabled || !burner || !client || !arena || contestId === undefined) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAdvance({ status: "off" });
      return;
    }
    setAdvance({ status: "waiting" });
    const wallet = burnerWalletClient(burner.account);
    let cancelled = false;

    const tick = async () => {
      const { chain: c, onChain: b, slot: s, balance: bal } = latest.current;
      if (cancelled || inFlight.current || !c || !b || s === null) return;
      const hops = planHops(c, b, s);
      if (hops.length === 0) {
        setAdvance({ status: "up-to-date", at: Date.now() });
        return;
      }
      if (bal !== undefined && bal === 0n) {
        setAdvance({ status: "needs-funds" });
        return;
      }
      inFlight.current = true;
      setAdvance({ status: "sending", hops: hops.length });
      try {
        let last: Hash | undefined;
        // Hops go back-to-back (the burner's nonce manager orders them); each is simulated first.
        for (const hop of hops) {
          const { request } = await client.simulateContract({
            address: arena,
            abi: arenaAbi,
            functionName: "advanceBeacon",
            args: [contestId, { slot: hop.slot, token: hop.token }],
            account: burner.account,
          });
          last = await wallet.writeContract({ ...request, chain: wallet.chain, account: burner.account });
        }
        if (last) await client.waitForTransactionReceipt({ hash: last });
        if (cancelled) return;
        setAdvance({ status: "ok", slot: hops[hops.length - 1].slot, at: Date.now(), hash: last! });
        void queryClient.invalidateQueries({ queryKey: arenaKeys.contest(chainId, contestId) });
        void balance.refetch();
      } catch (err) {
        if (cancelled) return;
        const e = explainError(err);
        const broke = /insufficient funds/i.test(String((err as { message?: unknown })?.message ?? ""));
        setAdvance(broke ? { status: "needs-funds" } : { status: "error", message: e.title, at: Date.now() });
      } finally {
        inFlight.current = false;
      }
    };

    const first = setTimeout(tick, FIRST_ADVANCE_MS);
    const every = setInterval(tick, ADVANCE_EVERY_MS);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(every);
    };
    // `balance` is read through `latest`; refetch is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, burner, client, arena, contestId, chainId, queryClient]);

  return { address, isE2E: burner?.isE2E ?? false, balance: balance.data, balanceLoading: balance.isPending, advance };
}
