"use client";

import { Coins, DoorOpen, Globe, Users, Wifi } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { localInputToUnix } from "@/components/ui/DateTimeField";
import { currencyLabel } from "@/config/network";
import { formatEth } from "@/lib/format";
import { ipfsDisplayUrl } from "@/lib/ipfs";
import { cn } from "@/lib/cn";
import { parseEthInput, type Draft, type Presence } from "./draft";

const PRESENCE_COPY: Record<Presence, { label: string; icon: typeof Globe }> = {
  Anywhere: { label: "Vote from anywhere", icon: Globe },
  Room: { label: "In the room", icon: Wifi },
  Gated: { label: "Door check-in", icon: DoorOpen },
};

const dateFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

function when(local: string): string | null {
  const unix = localInputToUnix(local);
  return unix === null ? null : dateFmt.format(new Date(unix * 1000));
}

/** How the contest will look on its page, updated as the form is filled in. */
export function PreviewCard({ draft, className }: { draft: Draft; className?: string }) {
  const cover = draft.cover ? ipfsDisplayUrl(draft.cover) : null;
  const Presence = PRESENCE_COPY[draft.presence];
  const prize = parseEthInput(draft.prizeEth);
  const prizeWei = prize.ok ? prize.wei : 0n;
  const opens = when(draft.votingStart);
  const closes = when(draft.votingEnd);
  const entriesClose = when(draft.submissionEnd);

  return (
    <Card padding="none" className={cn("overflow-hidden", className)} aria-label="Preview of your contest">
      <div className="bg-fg/6 relative aspect-[2/1]">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-chosen image from a gateway
          <img src={cover} alt="" className="size-full object-cover" />
        ) : (
          <div
            aria-hidden
            className="size-full"
            style={{
              background:
                "radial-gradient(120% 120% at 15% 10%, color-mix(in oklab, var(--color-accent) 38%, transparent), transparent 60%), radial-gradient(100% 100% at 90% 100%, color-mix(in oklab, var(--color-prize) 30%, transparent), transparent 55%)",
            }}
          />
        )}
        <div className="absolute top-3 left-3">
          <Badge tone="accent" icon={<Presence.icon aria-hidden />} className="backdrop-blur-md">
            {Presence.label}
          </Badge>
        </div>
      </div>
      <div className="flex flex-col gap-3 p-5">
        <div>
          <h3 className={cn("text-title-3 text-balance break-words", draft.title.trim() ? "text-fg" : "text-fg-muted")}>
            {draft.title.trim() || "Your contest name"}
          </h3>
          <p
            className={cn(
              "text-footnote mt-1.5 line-clamp-3 break-words whitespace-pre-line",
              draft.description.trim() ? "text-fg-muted" : "text-fg-muted/70",
            )}
          >
            {draft.description.trim() || "A line or two about what people are voting on."}
          </p>
        </div>
        <dl className="text-footnote flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-fg-muted inline-flex items-center gap-1.5">
              <Coins className="size-4" strokeWidth={1.75} aria-hidden />
              Prize
            </dt>
            <dd className="text-fg tabular">{prizeWei > 0n ? `${formatEth(prizeWei, { maxDecimals: 6 })} ${currencyLabel}` : "No prize"}</dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt className="text-fg-muted inline-flex items-center gap-1.5">
              <Users className="size-4" strokeWidth={1.75} aria-hidden />
              Entries
            </dt>
            <dd className="text-fg text-right">
              {draft.openSubmissions ? "Anyone can submit" : "You add them"}
              {entriesClose ? <span className="text-fg-muted block">until {entriesClose}</span> : null}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt className="text-fg-muted">Voting</dt>
            <dd className="text-fg tabular text-right">
              {opens && closes ? (
                <>
                  {opens}
                  <span className="text-fg-muted block">to {closes}</span>
                </>
              ) : (
                <span className="text-fg-muted">Not set yet</span>
              )}
            </dd>
          </div>
        </dl>
      </div>
    </Card>
  );
}
