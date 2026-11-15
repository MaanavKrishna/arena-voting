"use client";

import { ArrowLeftRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useConnection, useSwitchChain } from "wagmi";
import type { Address } from "viem";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { useIsClient, useReducedMotionPref } from "@/components/ui/hooks";
import { chainName, targetChain } from "@/config/network";
import { explainError, type ExplainedError } from "@/lib/errors";
import { fade, spring } from "@/lib/motion";

/** Where the wallet stands relative to what a write needs. */
export type GuardState = "checking" | "connect" | "wrong-network" | "ready";

type ConnectionStatus = "connected" | "connecting" | "reconnecting" | "disconnected";

/** Pure: connection status + chain → guard state. `checking` covers hydration and reconnecting. */
export function guardState(input: {
  mounted: boolean;
  status: ConnectionStatus;
  address?: string;
  chainId?: number;
  targetChainId: number;
}): GuardState {
  if (!input.mounted) return "checking";
  if (input.status === "connecting" || input.status === "reconnecting") {
    return input.address ? (input.chainId === input.targetChainId ? "ready" : "checking") : "checking";
  }
  if (input.status !== "connected" || !input.address) return "connect";
  return input.chainId === input.targetChainId ? "ready" : "wrong-network";
}

export type NetworkGuardApi = {
  state: GuardState;
  address?: Address;
  /** Asks the wallet to move to the app's network. */
  switchNetwork: () => void;
  isSwitching: boolean;
  /** Plain-English copy when the last switch failed. */
  switchError: ExplainedError | null;
};

/** The wallet gate every write goes through: connect → right network → ready. */
export function useNetworkGuard(): NetworkGuardApi {
  const mounted = useIsClient();
  const { status, address, chainId } = useConnection();
  const sw = useSwitchChain();
  return {
    state: guardState({ mounted, status, address, chainId, targetChainId: targetChain.id }),
    address,
    switchNetwork: () => sw.mutate({ chainId: targetChain.id }),
    isSwitching: sw.isPending,
    switchError: sw.error ? explainError(sw.error) : null,
  };
}

/**
 * A slim notice under the nav while the wallet is connected to some other network.
 * Reads keep working (they use the app's network directly); only actions need the switch.
 */
export function NetworkGuard({ className }: { className?: string }) {
  const { state, switchNetwork, isSwitching, switchError } = useNetworkGuard();
  const reduce = useReducedMotionPref();
  const show = state === "wrong-network";

  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          key="network-guard"
          role="region"
          aria-label="Network"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={reduce ? fade : spring.smooth}
          className={cn("max-w-content mx-auto w-full px-4 pt-3 md:px-8", className)}
        >
          <div className="solid squircle flex flex-col gap-3 rounded-md px-4 py-3 shadow-sm sm:flex-row sm:items-center">
            <span aria-hidden className="bg-warning/18 text-warning-text grid size-8 shrink-0 place-items-center rounded-full">
              <ArrowLeftRight className="size-4" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-callout text-fg">Your wallet is on a different network.</p>
              <p className="text-footnote text-fg-muted" aria-live="polite">
                {switchError ? switchError.title : `Arena runs on ${chainName}. You can still look around.`}
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={switchNetwork} loading={isSwitching}>
              Switch to {chainName}
            </Button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
