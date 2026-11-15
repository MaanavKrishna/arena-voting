"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { spring } from "@/lib/motion";
import { cn } from "./cn";
import { useToast } from "./Toast";

/** `0x1234…abcd` */
export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

/** Deterministic two-hue gradient from the address bytes (same address → same avatar). */
export function avatarGradient(address: string): string {
  const hex = address.toLowerCase().replace(/^0x/, "").padEnd(40, "0");
  const byte = (i: number) => parseInt(hex.slice(i * 2, i * 2 + 2), 16) || 0;
  const h1 = Math.round((byte(0) / 255) * 360);
  const h2 = (h1 + 60 + Math.round((byte(1) / 255) * 120)) % 360;
  const angle = Math.round((byte(2) / 255) * 360);
  return `linear-gradient(${angle}deg, oklch(0.72 0.15 ${h1}), oklch(0.6 0.17 ${h2}))`;
}

export function AddressAvatar({ address, className }: { address: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("ring-border inline-block size-5 shrink-0 rounded-full ring-1 ring-inset", className)}
      style={{ backgroundImage: avatarGradient(address) }}
    />
  );
}

export type AddressChipProps = {
  address: string;
  /** Block explorer address page; comes from the network config. */
  explorerUrl?: string;
  label?: string;
  className?: string;
};

export function AddressChip({ address, explorerUrl, label, className }: AddressChipProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { toast } = useToast();
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      toast({ tone: "error", title: "Couldn't copy", description: "Select the address and copy it by hand." });
    }
  };

  return (
    <span
      className={cn(
        "bg-fg/5 border-border inline-flex h-8 items-center gap-1.5 rounded-full border pr-1 pl-1.5",
        className,
      )}
    >
      <AddressAvatar address={address} />
      {label ? <span className="text-footnote text-fg">{label}</span> : null}
      <span className={cn("text-mono", label ? "text-fg-muted" : "text-fg")} title={address}>
        {shortAddress(address)}
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Address copied" : "Copy address"}
        className="text-fg-muted hover:text-fg hover:bg-fg/8 relative grid size-6 place-items-center rounded-full transition-colors after:absolute after:-inset-2.5"
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={copied ? "done" : "copy"}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={spring.snappy}
            className={cn("grid place-items-center", copied && "text-verified-text")}
          >
            {copied ? <Check className="size-3.5" strokeWidth={2.5} /> : <Copy className="size-3.5" strokeWidth={1.75} />}
          </motion.span>
        </AnimatePresence>
      </button>
      {explorerUrl ? (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noreferrer"
          aria-label="View on block explorer"
          className="text-fg-muted hover:text-fg hover:bg-fg/8 relative grid size-6 place-items-center rounded-full transition-colors after:absolute after:-inset-2.5"
        >
          <ExternalLink className="size-3.5" strokeWidth={1.75} aria-hidden />
        </a>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {copied ? "Address copied" : ""}
      </span>
    </span>
  );
}
