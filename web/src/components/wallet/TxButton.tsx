"use client";

import { Check, ChevronDown, ExternalLink, RotateCw } from "lucide-react";
import { motion } from "motion/react";
import { useId, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useReducedMotionPref } from "@/components/ui/hooks";
import { chainName, explorerTxUrl } from "@/config/network";
import type { WriteStatus } from "@/hooks/useArenaWrite";
import { cn } from "@/lib/cn";
import { fade, spring } from "@/lib/motion";
import { useConnectLauncher } from "./ConnectSheet";
import { useNetworkGuard, type GuardState } from "./NetworkGuard";

/**
 * Contract-write button. Handles: not connected → "Connect", wrong network → "Switch to …",
 * then the write lifecycle (simulating / confirm in wallet / pending / confirmed / error).
 */
export type TxButtonProps = {
  /** Result of useArenaWrite(...) — only status/isBusy/error/txHash are read. */
  action: { status: WriteStatus; isBusy: boolean; error: { title: string; detail?: string } | null; txHash?: `0x${string}` };
  /** Starts the write (usually () => action.write({ args: [...] })). */
  onClick: () => void;
  children: ReactNode;
  /** Text shown while confirmed (default "Done"). */
  confirmedLabel?: ReactNode;
  /** When set, the button is disabled and this reason is shown beneath it. */
  disabledReason?: string | null;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  className?: string;
  /** Hide passkey (Face ID) wallets in the Connect sheet — Gated contests. */
  hidePasskeyWallets?: boolean;
};

export type TxView =
  | "checking"
  | "connect"
  | "wrong-network"
  | "switching"
  | "disabled"
  | "ready"
  | "preparing"
  | "confirm-in-wallet"
  | "pending"
  | "confirmed"
  | "error";

/**
 * Pure state picker. A write in flight (or just confirmed) always shows; otherwise a disabled
 * reason wins, then the wallet gate (connect → network), then the last error, then ready.
 */
export function txView(input: {
  guard: GuardState;
  status: WriteStatus;
  isSwitching: boolean;
  disabledReason?: string | null;
}): TxView {
  switch (input.status) {
    case "simulating":
      return "preparing";
    case "confirm-in-wallet":
      return "confirm-in-wallet";
    case "pending":
      return "pending";
    case "confirmed":
      return "confirmed";
  }
  if (input.disabledReason) return "disabled";
  if (input.guard === "checking") return "checking";
  if (input.guard === "connect") return "connect";
  if (input.guard === "wrong-network") return input.isSwitching ? "switching" : "wrong-network";
  if (input.status === "error") return "error";
  return "ready";
}

const BUSY: ReadonlySet<TxView> = new Set(["checking", "switching", "preparing", "confirm-in-wallet", "pending"]);

/** What a screen reader hears when the state changes. */
function announcement(view: TxView, errorTitle?: string): string {
  switch (view) {
    case "confirm-in-wallet":
      return "Confirm in your wallet.";
    case "pending":
      return "Waiting for the network to confirm.";
    case "confirmed":
      return "Done.";
    case "error":
      return errorTitle ?? "Something went wrong.";
    case "switching":
      return "Check your wallet to switch network.";
    default:
      return "";
  }
}

export function TxButton({
  action,
  onClick,
  children,
  confirmedLabel = "Done",
  disabledReason,
  variant = "primary",
  size = "md",
  fullWidth,
  className,
  hidePasskeyWallets,
}: TxButtonProps) {
  const guard = useNetworkGuard();
  const { openConnect, sheet } = useConnectLauncher();
  const reduce = useReducedMotionPref();
  const noteId = useId();

  const view = txView({
    guard: guard.state,
    status: action.status,
    isSwitching: guard.isSwitching,
    disabledReason,
  });
  const busy = BUSY.has(view);
  const inert = busy || view === "confirmed";

  const confirmedIcon = (
    <motion.span
      initial={false}
      animate={view === "confirmed" ? { scale: 1, opacity: 1 } : { scale: reduce ? 1 : 0.4, opacity: 0 }}
      transition={reduce ? fade : spring.celebrate}
      className="grid place-items-center"
    >
      <Check className="size-4" strokeWidth={2.5} aria-hidden />
    </motion.span>
  );
  // Each label carries its own icon, so the hidden copies measure the same as the visible one.
  const labels: { key: string; show: boolean; icon?: ReactNode; node: ReactNode }[] = [
    { key: "action", show: view === "ready" || view === "disabled" || view === "checking", node: children },
    { key: "connect", show: view === "connect", node: "Connect wallet" },
    {
      key: "switch",
      show: view === "wrong-network" || view === "switching",
      icon: view === "switching" ? <Spinner /> : undefined,
      node: `Switch to ${chainName}`,
    },
    { key: "preparing", show: view === "preparing", icon: <Spinner />, node: "Checking…" },
    { key: "confirm", show: view === "confirm-in-wallet", icon: <Spinner />, node: "Confirm in your wallet" },
    { key: "pending", show: view === "pending", icon: <Spinner />, node: "Finishing up…" },
    { key: "confirmed", show: view === "confirmed", icon: confirmedIcon, node: confirmedLabel },
    {
      key: "retry",
      show: view === "error",
      icon: <RotateCw className="size-4" strokeWidth={1.75} aria-hidden />,
      node: "Try again",
    },
  ];

  const handleClick = () => {
    if (inert) return;
    if (view === "connect") return openConnect({ hidePasskey: hidePasskeyWallets });
    if (view === "wrong-network") return guard.switchNetwork();
    onClick();
  };

  const note =
    view === "disabled"
      ? { tone: "muted" as const, title: disabledReason ?? "" }
      : view === "error" && action.error
        ? { tone: "danger" as const, title: action.error.title, detail: action.error.detail }
        : (view === "wrong-network" || view === "switching") && guard.switchError
          ? { tone: "danger" as const, title: guard.switchError.title }
          : null;
  const txUrl = action.txHash ? explorerTxUrl(action.txHash) : null;
  const showDetails = Boolean(action.txHash) && (view === "pending" || view === "confirmed" || view === "error");

  return (
    <div
      data-tx-state={view}
      className={cn("inline-flex flex-col items-stretch", fullWidth && "flex w-full", className)}
    >
      <Button
        variant={variant}
        size={size}
        onClick={handleClick}
        disabled={view === "disabled"}
        aria-busy={busy || undefined}
        aria-disabled={inert || undefined}
        aria-describedby={note ? noteId : undefined}
        className={cn(fullWidth && "w-full", inert && "cursor-default", busy && "aria-busy:cursor-progress")}
      >
        {/* Every label sits in one grid cell, so the button keeps the width of the longest. */}
        <span className="grid items-center justify-items-center">
          {labels.map((l) => (
            <motion.span
              key={l.key}
              aria-hidden={!l.show || undefined}
              initial={false}
              animate={l.show ? { opacity: 1, y: 0 } : { opacity: 0, y: reduce ? 0 : 4 }}
              transition={reduce ? fade : spring.snappy}
              className={cn(
                "col-start-1 row-start-1 inline-flex items-center gap-2",
                !l.show && "pointer-events-none invisible",
              )}
            >
              {l.icon}
              {l.node}
            </motion.span>
          ))}
        </span>
      </Button>

      {note ? (
        <div id={noteId} className="mt-2 text-center">
          <p className={cn("text-footnote", note.tone === "danger" ? "text-danger-text" : "text-fg-muted")}>{note.title}</p>
          {"detail" in note && note.detail ? <p className="text-footnote text-fg-muted mt-0.5">{note.detail}</p> : null}
        </div>
      ) : null}

      {showDetails && action.txHash ? (
        <details className="group mt-1.5 self-center text-center">
          <summary className="text-footnote text-fg-muted hover:text-fg inline-flex h-8 cursor-pointer list-none items-center gap-1 transition-colors [&::-webkit-details-marker]:hidden">
            Details
            <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" strokeWidth={1.75} aria-hidden />
          </summary>
          <div className="text-footnote text-fg-muted flex flex-col items-center gap-1 pb-1">
            <span>
              Reference <span className="text-mono text-fg" title={action.txHash}>{`${action.txHash.slice(0, 10)}…${action.txHash.slice(-6)}`}</span>
            </span>
            {txUrl ? (
              <a
                href={txUrl}
                target="_blank"
                rel="noreferrer"
                className="text-accent inline-flex h-8 items-center gap-1 underline-offset-4 hover:underline"
              >
                View on block explorer
                <ExternalLink className="size-3.5" strokeWidth={1.75} aria-hidden />
              </a>
            ) : null}
          </div>
        </details>
      ) : null}

      <span className="sr-only" role="status" aria-live="polite">
        {announcement(view, action.error?.title)}
      </span>
      {sheet}
    </div>
  );
}
