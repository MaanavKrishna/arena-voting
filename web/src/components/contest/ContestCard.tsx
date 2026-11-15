"use client";

import { Check, DoorOpen, Globe, Users } from "lucide-react";
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { BorderBeam } from "@/components/fx/hero/BorderBeam";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import { Countdown } from "@/components/ui/Countdown";
import { StatusPill, type Status } from "@/components/ui/StatusPill";
import { currencyLabel } from "@/config/network";
import { useMetadata } from "@/hooks/useMetadata";
import { useNow } from "@/hooks/useNow";
import type { ContestView } from "@/hooks/types";
import { formatEth } from "@/lib/format";
import { ipfsDisplayUrl } from "@/lib/ipfs";
import { phaseOf, type Phase } from "@/lib/phase";

/** Where a phase sits in the status pill, and the words used for it. */
export function statusOf(phase: Phase): { status: Status; label: string } {
  switch (phase) {
    case "voting":
      return { status: "live", label: "Live" };
    case "submissions":
      return { status: "upcoming", label: "Taking entries" };
    case "upcoming":
      return { status: "upcoming", label: "Upcoming" };
    case "finalized":
      return { status: "ended", label: "Winner paid" };
    case "ended":
      return { status: "ended", label: "Ended" };
  }
}

type Boundary = { label: string; to: number | null };

/** The next moment that changes what people can do, or `to: null` when nothing is left to count down. */
export function nextBoundary(c: Pick<ContestView, "submissionEnd" | "votingStart" | "votingEnd" | "finalized">, now: bigint): Boundary {
  switch (phaseOf(c, now)) {
    case "submissions":
      return { label: "Entries close in", to: Number(c.submissionEnd) };
    case "upcoming":
      return { label: "Voting opens in", to: Number(c.votingStart) };
    case "voting":
      return { label: "Voting closes in", to: Number(c.votingEnd) };
    case "ended":
      return { label: "Voting closed", to: null };
    case "finalized":
      return { label: "Finished", to: null };
  }
}

const PRESENCE: Record<number, { label: string; tone: BadgeTone; icon: typeof Globe }> = {
  0: { label: "Vote from anywhere", tone: "neutral", icon: Globe },
  1: { label: "In the room", tone: "verified", icon: Check },
  2: { label: "Door check-in", tone: "verified", icon: DoorOpen },
};

export function presenceOf(presence: number) {
  return PRESENCE[presence] ?? PRESENCE[0]!;
}

/**
 * Two hues picked from the contest id, so every contest keeps its own cover. Built from OKLCH
 * directly: Tailwind only emits the colour tokens that some class uses, and the entry palette
 * is not guaranteed to be present.
 */
export function coverColors(id: bigint): [string, string] {
  const hue = Number((id * 67n + 255n) % 360n);
  const second = (hue + 70 + Number(id % 5n) * 10) % 360;
  const tone = (h: number) => `light-dark(oklch(0.66 0.16 ${h}), oklch(0.58 0.15 ${h}))`;
  return [tone(hue), tone(second)];
}

export function coverGradient(id: bigint): string {
  const [a, b] = coverColors(id);
  const angle = 120 + Number(id % 6n) * 20;
  return `linear-gradient(${angle}deg, ${a}, ${b})`;
}

function Cover({ contest }: { contest: ContestView }) {
  const { data } = useMetadata(contest.metadataURI, "contest");
  const [failed, setFailed] = useState(false);
  const src = data.cover && !failed ? ipfsDisplayUrl(data.cover) : null;
  const style: CSSProperties = { backgroundImage: coverGradient(contest.id) };

  return (
    <div className="relative aspect-16/10 w-full overflow-hidden rounded-sm" style={style}>
      <div
        aria-hidden
        className="absolute inset-0 opacity-60 mix-blend-soft-light"
        style={{ backgroundImage: "radial-gradient(120% 90% at 20% 0%, white, transparent 60%)" }}
      />
      <span
        aria-hidden
        className="text-display tabular absolute right-4 bottom-1 font-semibold select-none"
        style={{ color: "oklch(1 0 0 / 0.3)" }}
      >
        {String(contest.id).padStart(2, "0")}
      </span>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote IPFS gateway, user-supplied
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
        />
      ) : null}
    </div>
  );
}

/** One contest as a single link: cover, status, title, prize, presence, votes and the next countdown. */
export function ContestCard({ contest, beam, className }: { contest: ContestView; beam?: boolean; className?: string }) {
  const now = useNow();
  const phase = now === 0n ? null : phaseOf(contest, now);
  const { status, label } = statusOf(phase ?? "voting");
  const boundary = now === 0n ? null : nextBoundary(contest, now);
  const presence = presenceOf(contest.presence);
  const PresenceIcon = presence.icon;
  const votes = contest.totalVotes;

  return (
    <Link
      href={`/c/${contest.id}`}
      className={cn(
        "solid squircle shadow-sm group relative flex flex-col rounded-md p-3",
        "transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.99]",
        "focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2",
        className,
      )}
    >
      <Cover contest={contest} />
      <div className="flex flex-1 flex-col gap-3 px-1 pt-4 pb-1">
        <div className="flex flex-wrap items-center gap-2">
          {phase ? <StatusPill status={status} label={label} /> : <span className="bg-fg/7 h-6 w-16 rounded-full" aria-hidden />}
          <Badge tone={presence.tone} icon={<PresenceIcon aria-hidden strokeWidth={2} />}>
            {presence.label}
          </Badge>
        </div>
        <h3 className="text-title-3 text-fg line-clamp-2 text-balance">{contest.title}</h3>
        <div className="mt-auto flex items-end justify-between gap-3 pt-1">
          <div className="min-w-0">
            <p className="text-caption-caps text-fg-subtle">Prize</p>
            <p className="text-callout text-prize-text tabular truncate font-medium">
              {formatEth(contest.prize)} {currencyLabel}
            </p>
          </div>
          <div className="text-footnote text-fg-muted flex flex-col items-end gap-0.5">
            <span className="inline-flex items-center gap-1 tabular">
              <Users aria-hidden className="size-3.5" strokeWidth={1.75} />
              {votes} {votes === 1 ? "vote" : "votes"}
            </span>
            {boundary ? (
              boundary.to !== null ? (
                <Countdown to={boundary.to} now={Number(now)} label={boundary.label} className="text-footnote" />
              ) : (
                <span>{boundary.label}</span>
              )
            ) : (
              <span aria-hidden className="bg-fg/7 h-4 w-24 rounded-xs" />
            )}
          </div>
        </div>
      </div>
      {beam ? <BorderBeam /> : null}
    </Link>
  );
}
