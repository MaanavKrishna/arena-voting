"use client";

import { KeyRound } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { Address } from "viem";
import { AddressChip } from "@/components/ui/AddressChip";
import { Spinner } from "@/components/ui/Spinner";
import { currencyLabel, explorerAddressUrl } from "@/config/network";
import { formatEth } from "@/lib/format";

/**
 * First run on a new device: this Gate's own key isn't authorised yet. Shows its address as a QR
 * for the organiser's Manage page to scan, and waits (the parent polls the contract).
 */
export function GateSetup({
  address,
  balance,
  perCheckIn,
}: {
  address: Address;
  balance: bigint | undefined;
  perCheckIn: bigint | undefined;
}) {
  return (
    <div className="mx-auto grid w-full max-w-4xl items-center gap-8 md:grid-cols-[auto_1fr] md:gap-12">
      <figure data-theme="light" className="bg-bg-elevated text-fg squircle mx-auto w-fit rounded-lg p-4 shadow-lg">
        <QRCodeSVG
          value={address}
          size={232}
          level="M"
          marginSize={2}
          fgColor="currentColor"
          bgColor="transparent"
          role="img"
          aria-label="This gate's address as a QR code"
        />
      </figure>

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-caption-caps text-fg-muted flex items-center gap-1.5">
            <KeyRound className="size-3.5" strokeWidth={1.75} aria-hidden />
            New gate
          </p>
          <h1 className="text-title-1 text-fg text-balance">Authorise this gate</h1>
          <p className="text-callout text-fg-muted max-w-prose text-pretty">
            This device checks people in with its own key. The organiser lets it in once, from the contest&rsquo;s
            Manage page.
          </p>
        </div>

        <ol className="text-callout text-fg flex flex-col gap-3">
          <Step n={1}>
            On the organiser&rsquo;s device, open <strong className="font-semibold">Manage → Door devices</strong>.
          </Step>
          <Step n={2}>Tap Scan and point it at this code, or paste the address below.</Step>
          <Step n={3}>
            Fund the gate with some {currencyLabel}
            {perCheckIn ? <> (about {formatEth(perCheckIn, { maxDecimals: 5 })} per check-in)</> : null}.
          </Step>
        </ol>

        <div className="flex flex-col items-start gap-2">
          <AddressChip address={address} explorerUrl={explorerAddressUrl(address) ?? undefined} />
          <p className="text-footnote text-fg-muted tabular">
            Balance: {balance === undefined ? "checking…" : `${formatEth(balance)} ${currencyLabel}`}
          </p>
        </div>

        <p className="text-callout text-fg-muted flex items-center gap-2" role="status" aria-live="polite">
          <Spinner className="size-4" />
          Waiting for the organiser to authorise this gate…
        </p>
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="bg-accent/14 text-accent text-caption tabular grid size-6 shrink-0 place-items-center rounded-full"
      >
        {n}
      </span>
      <span className="text-pretty">{children}</span>
    </li>
  );
}
