"use client";

import { BadgeCheck, DoorOpen, Globe } from "lucide-react";
import type { ReactNode } from "react";
import { NumberTicker } from "@/components/fx/NumberTicker";
import { AddressChip } from "@/components/ui/AddressChip";
import { Badge } from "@/components/ui/Badge";
import { Countdown } from "@/components/ui/Countdown";
import { StatusPill } from "@/components/ui/StatusPill";
import { currencyLabel, explorerAddressUrl } from "@/config/network";
import type { ContestView } from "@/hooks/types";
import { useMetadata } from "@/hooks/useMetadata";
import { formatEth } from "@/lib/format";
import type { Phase } from "@/lib/phase";
import { nextBoundary, statusOf } from "./ContestCard";
import { PRESENCE_GATED, PRESENCE_ROOM, tickerParts, verificationOf } from "./contestLogic";
import { ShareButton } from "./ShareButton";

const presenceIcon = { [PRESENCE_ROOM]: BadgeCheck, [PRESENCE_GATED]: DoorOpen } as Record<number, typeof Globe>;

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-caption-caps text-fg-subtle">{label}</dt>
      <dd className="text-title-3 text-fg tabular truncate">{children}</dd>
    </div>
  );
}

/** Title, status, the next deadline, prize and the trust facts about how votes are verified. */
export function ContestHeader({ contest, phase, now }: { contest: ContestView; phase: Phase | undefined; now: bigint }) {
  const { data: meta } = useMetadata(contest.metadataURI, "contest");
  const status = phase ? statusOf(phase) : null;
  const boundary = phase && now > 0n ? nextBoundary(contest, now) : null;
  const badge = verificationOf(contest.presence);
  const BadgeIcon = presenceIcon[contest.presence] ?? Globe;
  const prize = tickerParts(formatEth(contest.prize));
  const explorer = explorerAddressUrl(contest.organiser) ?? undefined;

  return (
    <header className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {status ? (
            <StatusPill status={status.status} label={status.label} />
          ) : (
            <span aria-hidden className="bg-fg/7 h-6 w-16 rounded-full" />
          )}
          <span title={badge.description}>
            <Badge tone={badge.tone} icon={<BadgeIcon aria-hidden strokeWidth={2} />}>
              {badge.label}
            </Badge>
          </span>
          <span className="sr-only">{badge.description}</span>
        </div>
        <h1 className="text-display text-fg max-w-4xl text-balance">{contest.title}</h1>
        {meta.description ? (
          <p className="text-body text-fg-muted max-w-prose line-clamp-4 text-pretty whitespace-pre-line">
            {meta.description}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-footnote text-fg-muted">Organised by</span>
          <AddressChip address={contest.organiser} explorerUrl={explorer} />
          <span className="ml-auto">
            <ShareButton contestId={contest.id} title={contest.title} />
          </span>
        </div>
      </div>

      <dl className="border-border grid grid-cols-2 gap-x-6 gap-y-5 border-y py-5 sm:flex sm:flex-wrap sm:gap-x-10">
        <Stat label="Prize">
          <span className="text-prize-text">
            <NumberTicker value={prize.value} decimals={prize.decimals} />
            <span className="text-callout text-fg-muted ml-1.5 font-normal">{currencyLabel}</span>
          </span>
        </Stat>
        <Stat label="Votes">
          <NumberTicker value={contest.totalVotes} />
        </Stat>
        {contest.presence === PRESENCE_GATED ? (
          <Stat label="Checked in">
            <NumberTicker value={contest.checkedInCount} />
          </Stat>
        ) : null}
        <Stat label={boundary?.to != null ? boundary.label.replace(/ in$/, "") : "Status"}>
          {boundary ? (
            boundary.to !== null ? (
              <Countdown to={boundary.to} now={Number(now)} label={boundary.label} className="[&_.text-fg-muted]:sr-only" />
            ) : (
              <span className="text-fg-muted">{boundary.label}</span>
            )
          ) : (
            <span aria-hidden className="bg-fg/7 inline-block h-5 w-24 rounded-xs" />
          )}
        </Stat>
      </dl>
    </header>
  );
}
