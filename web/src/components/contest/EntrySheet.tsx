"use client";

import { ArrowUpRight, Check } from "lucide-react";
import type { ComponentProps } from "react";
import { AddressChip } from "@/components/ui/AddressChip";
import { Sheet } from "@/components/ui/Sheet";
import { TxButton } from "@/components/wallet/TxButton";
import { explorerAddressUrl } from "@/config/network";
import type { EntryWithMetadata } from "@/hooks/useEntries";
import { EntryImage } from "./EntryImage";
import { PresenceSlot } from "./PresenceSlot";
import { PRESENCE_ANYWHERE, PRESENCE_GATED } from "./contestLogic";

export type EntrySheetProps = {
  entry: EntryWithMetadata | null;
  name: string;
  color: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contestId: bigint;
  presence: number;
  /** The voting window is open (otherwise there's no vote action, just the details). */
  votingOpen: boolean;
  /** The connected wallet already voted for this entry. */
  votedForThis: boolean;
  winner: boolean;
  action: ComponentProps<typeof TxButton>["action"];
  onVote: () => void;
  disabledReason: string | null;
  /** Shown instead of the button when voting isn't open. */
  closedNote: string;
};

/** Entry details and the vote action. Bottom sheet on phone (button in thumb reach), dialog on desktop. */
export function EntrySheet({
  entry,
  name,
  color,
  open,
  onOpenChange,
  contestId,
  presence,
  votingOpen,
  votedForThis,
  winner,
  action,
  onVote,
  disabledReason,
  closedNote,
}: EntrySheetProps) {
  const meta = entry?.metadata;
  const footer = votedForThis ? (
    <p className="text-callout text-verified-text flex h-12 items-center justify-center gap-2" role="status">
      <Check className="size-5" strokeWidth={2.5} aria-hidden />
      You voted for this entry
    </p>
  ) : votingOpen ? (
    <div className="flex flex-col gap-3">
      {presence !== PRESENCE_ANYWHERE ? <PresenceSlot contestId={contestId} presence={presence} /> : null}
      <TxButton
        action={action}
        onClick={onVote}
        disabledReason={disabledReason}
        size="lg"
        fullWidth
        confirmedLabel="Vote counted"
        hidePasskeyWallets={presence === PRESENCE_GATED}
      >
        Vote for {name}
      </TxButton>
    </div>
  ) : (
    <p className="text-callout text-fg-muted flex min-h-12 items-center justify-center text-center">{closedNote}</p>
  );

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={name}
      description={meta?.tagline || undefined}
      footer={entry ? footer : undefined}
    >
      {entry ? (
        <div className="flex flex-col gap-5">
          <EntryImage uri={meta?.image} name={name} color={color} sizes="xl" />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-callout text-fg inline-flex items-center gap-2">
              <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="tabular font-medium">{entry.votes}</span>
              <span className="text-fg-muted">{entry.votes === 1 ? "vote" : "votes"}</span>
            </span>
            {winner ? <span className="text-callout text-prize-text font-medium">Winner</span> : null}
          </div>
          {meta?.description ? (
            <p className="text-body text-fg text-pretty whitespace-pre-line">{meta.description}</p>
          ) : entry.metadataStatus !== "loading" ? (
            <p className="text-callout text-fg-muted">No description was published for this entry.</p>
          ) : null}
          {meta?.links?.length ? (
            <ul className="flex flex-wrap gap-2">
              {meta.links.map((l) => (
                <li key={l.url}>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="glass-thin text-callout text-fg hover:bg-fg/5 inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 transition-colors"
                  >
                    {l.label}
                    <ArrowUpRight className="text-fg-muted size-4" strokeWidth={1.75} aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="border-border flex flex-wrap items-center gap-2 border-t pt-4">
            <span className="text-footnote text-fg-muted">Prize goes to</span>
            <AddressChip address={entry.payee} explorerUrl={explorerAddressUrl(entry.payee) ?? undefined} />
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
