"use client";

import { Gift, Gavel } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { TxButton } from "@/components/wallet/TxButton";
import { currencyLabel } from "@/config/network";
import { formatEth } from "@/lib/format";

type Action = ComponentProps<typeof TxButton>["action"];

function ActionCard({
  icon,
  tone,
  title,
  description,
  children,
  className,
}: {
  icon: ReactNode;
  tone: "accent" | "prize";
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "solid squircle shadow-sm flex flex-col gap-4 rounded-md p-5 sm:flex-row sm:items-center",
        className,
      )}
    >
      <span
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-full [&_svg]:size-5",
          tone === "prize" ? "bg-prize/20 text-prize-text" : "bg-accent/12 text-accent",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-title-3 text-fg">{title}</h2>
        <p className="text-callout text-fg-muted mt-0.5 text-pretty">{description}</p>
      </div>
      <div className="shrink-0 sm:min-w-44">{children}</div>
    </section>
  );
}

/** After voting closes: anyone can finalise, which works out the winner and sets the prize aside. */
export function FinalizeCard({ action, onFinalize }: { action: Action; onFinalize: () => void }) {
  return (
    <ActionCard
      tone="accent"
      icon={<Gavel strokeWidth={1.75} aria-hidden />}
      title="Voting has closed"
      description="Anyone can finalise the results. The contract counts the votes and sets the prize aside for the winner."
    >
      <TxButton action={action} onClick={onFinalize} fullWidth confirmedLabel="Finalised">
        Finalise results
      </TxButton>
    </ActionCard>
  );
}

/** A winner (or a refunded organiser) collects what the contract set aside for this wallet. */
export function ClaimCard({
  amount,
  action,
  onClaim,
  refund,
}: {
  amount: bigint;
  action: Action;
  onClaim: () => void;
  /** The organiser is getting the prize back (no votes, or a split remainder). */
  refund?: boolean;
}) {
  return (
    <ActionCard
      tone="prize"
      icon={<Gift strokeWidth={1.75} aria-hidden />}
      title={refund ? "Money to collect" : "Your prize is ready"}
      description={
        <>
          <span className="text-prize-text tabular font-medium">
            {formatEth(amount)} {currencyLabel}
          </span>{" "}
          is waiting for this wallet. It includes anything else Arena owes you.
        </>
      }
    >
      <TxButton action={action} onClick={onClaim} fullWidth confirmedLabel="Sent to your wallet">
        {refund ? "Collect" : "Collect prize"}
      </TxButton>
    </ActionCard>
  );
}
