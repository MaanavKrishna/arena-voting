"use client";

import { Activity, ExternalLink, LogOut } from "lucide-react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useBalance, useConnection, useDisconnect } from "wagmi";
import { AddressAvatar, AddressChip, shortAddress } from "@/components/ui/AddressChip";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { useIsDesktop, useReducedMotionPref } from "@/components/ui/hooks";
import { chainName, currencyLabel, explorerAddressUrl, targetChain } from "@/config/network";
import { cn } from "@/lib/cn";
import { formatEth } from "@/lib/format";
import { fade, spring } from "@/lib/motion";
import { useNetworkGuard } from "./NetworkGuard";

/** Connected-account button + menu: address, network, balance, copy, explorer, disconnect. */
export function AccountMenu({ className }: { className?: string }) {
  const { address } = useConnection();
  const desktop = useIsDesktop();
  const reduce = useReducedMotionPref();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // Desktop popover: outside click and Esc close it; Esc returns focus to the trigger.
  useEffect(() => {
    if (!open || !desktop) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    const raf = requestAnimationFrame(() => popoverRef.current?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, desktop]);

  if (!address) return null;

  const panel = <AccountPanel address={address} onDone={() => setOpen(false)} />;

  return (
    <div className={cn("relative", className)}>
      <motion.button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`Account ${shortAddress(address)}`}
        onClick={() => setOpen((o) => !o)}
        whileTap={{ scale: 0.97 }}
        transition={spring.snappy}
        data-testid="account-menu"
        className={cn(
          "bg-fg/6 hover:bg-fg/10 relative inline-flex h-8 items-center gap-2 rounded-full pr-1.5 pl-1 transition-colors md:pr-3",
          "after:absolute after:-inset-y-1.5 after:inset-x-0",
          open && "bg-fg/10",
        )}
      >
        <AddressAvatar address={address} className="size-6" />
        <span className="text-mono text-fg hidden md:inline">{shortAddress(address)}</span>
      </motion.button>

      {desktop ? (
        <AnimatePresence>
          {open ? (
            <motion.div
              key="account-popover"
              ref={popoverRef}
              id={panelId}
              role="dialog"
              aria-label="Your account"
              tabIndex={-1}
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, filter: "blur(8px)" }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, filter: "blur(8px)" }}
              transition={reduce ? fade : spring.smooth}
              style={{ transformOrigin: "top right" }}
              className="glass-thick squircle absolute top-full right-0 z-50 mt-2 w-80 rounded-lg p-4 outline-none"
            >
              {panel}
            </motion.div>
          ) : null}
        </AnimatePresence>
      ) : (
        <Sheet open={open} onOpenChange={setOpen} title="Your account">
          {panel}
        </Sheet>
      )}
    </div>
  );
}

function AccountPanel({ address, onDone }: { address: `0x${string}`; onDone: () => void }) {
  const { connector } = useConnection();
  const { state, switchNetwork, isSwitching } = useNetworkGuard();
  const balance = useBalance({ address, chainId: targetChain.id });
  const disconnect = useDisconnect();
  const explorer = explorerAddressUrl(address);
  const walletName = connector?.type === "mock" ? "Test wallet" : connector?.name;
  const wrongNetwork = state === "wrong-network";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-start gap-1.5">
        <AddressChip address={address} explorerUrl={explorer ?? undefined} />
        {walletName ? <p className="text-footnote text-fg-muted pl-1">Connected with {walletName}</p> : null}
      </div>

      <dl className="bg-fg/4 divide-border squircle divide-y rounded-md">
        <Row label="Network">
          {wrongNetwork ? (
            <span className="flex items-center gap-2">
              <span className="text-warning-text">Different network</span>
              <Button size="sm" variant="secondary" loading={isSwitching} onClick={switchNetwork}>
                Switch
              </Button>
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <span aria-hidden className="bg-verified size-2 rounded-full" />
              {chainName}
            </span>
          )}
        </Row>
        <Row label="Balance">
          {balance.data ? (
            <span className="tabular">
              {formatEth(balance.data.value)} <span className="text-fg-muted">{currencyLabel}</span>
            </span>
          ) : balance.isError ? (
            <span className="text-fg-muted">Unavailable</span>
          ) : (
            <Skeleton className="h-4 w-24" />
          )}
        </Row>
      </dl>

      <div className="flex flex-col gap-1">
        <Link
          href="/me"
          onClick={onDone}
          className="text-callout text-fg hover:bg-fg/6 flex h-11 items-center gap-3 rounded-sm px-3 transition-colors"
        >
          <Activity className="text-fg-muted size-4" strokeWidth={1.75} aria-hidden />
          My activity
        </Link>
        {explorer ? (
          <a
            href={explorer}
            target="_blank"
            rel="noreferrer"
            className="text-callout text-fg hover:bg-fg/6 flex h-11 items-center gap-3 rounded-sm px-3 transition-colors"
          >
            <ExternalLink className="text-fg-muted size-4" strokeWidth={1.75} aria-hidden />
            View on block explorer
          </a>
        ) : null}
        <button
          type="button"
          onClick={() => {
            disconnect.mutate();
            onDone();
          }}
          className="text-callout text-danger-text hover:bg-danger/8 flex h-11 items-center gap-3 rounded-sm px-3 text-left transition-colors"
        >
          <LogOut className="size-4" strokeWidth={1.75} aria-hidden />
          Disconnect
        </button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 px-3.5 py-2">
      <dt className="text-callout text-fg-muted">{label}</dt>
      <dd className="text-callout text-fg text-right">{children}</dd>
    </div>
  );
}
