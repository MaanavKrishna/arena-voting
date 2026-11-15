"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import type { WriteStatus } from "@/hooks/useArenaWrite";

/**
 * Contract-write button. Handles: not connected → "Connect", wrong network → "Switch to …",
 * then the write lifecycle (simulating / confirm in wallet / pending / confirmed / error).
 * STUB (props are the contract): the shell/wallet agent replaces the body, keeping these props.
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
};

export function TxButton({ action, onClick, children, disabledReason, className }: TxButtonProps) {
  return (
    <Button className={className} onClick={onClick} disabled={Boolean(disabledReason) || action.isBusy}>
      {children}
    </Button>
  );
}
