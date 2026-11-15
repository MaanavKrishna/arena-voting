"use client";

import { Activity } from "lucide-react";
import { NumberTicker } from "@/components/fx/NumberTicker";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import type { ContestView } from "@/hooks/types";
import { relativeTime } from "@/lib/format";
import { beaconHealth } from "./beaconHealth";
import { ControlCard } from "./ControlCard";
import { PRESENCE_LABEL, presenceOf } from "./presence";

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-fg/4 rounded-sm px-4 py-3">
      <p className="text-caption-caps text-fg-muted">{label}</p>
      <p className="text-title-1 text-fg tabular mt-1">{children}</p>
    </div>
  );
}

export function StatsCard({ contest, now, ended }: { contest: ContestView; now: bigint; ended: boolean }) {
  const presence = presenceOf(contest.presence);
  const health = beaconHealth({
    beaconAnchorSet: contest.beaconRotation > 0,
    beaconStart: contest.beaconStart,
    beaconLength: contest.beaconLength,
    beaconCachedIndex: contest.beaconCachedIndex,
    now,
  });

  let beacon: { dot: string; text: string; sub?: string } | null = null;
  if (presence !== "Anywhere") {
    if (health.state === "not-set") beacon = { dot: "bg-fg-subtle", text: "Not set up yet", sub: "Open the Stage page to start the room signal." };
    else if (health.state === "waiting") beacon = { dot: "bg-warning", text: "Waiting for the first signal", sub: "No voter or Stage refresh has verified it yet." };
    else {
      const when = now === 0n ? "just now" : relativeTime(health.verifiedAt, now);
      beacon =
        health.state === "fresh" || ended
          ? { dot: ended ? "bg-fg-subtle" : "bg-live", text: `Last verified ${when}` }
          : { dot: "bg-warning", text: `Last verified ${when}`, sub: "Is the Stage page still running?" };
    }
  }

  return (
    <ControlCard id="stats" icon={<Activity strokeWidth={1.75} />} title="Live" description="Updates every few seconds.">
      <div className={cn("grid gap-3", presence === "Gated" ? "grid-cols-2" : "grid-cols-1")}>
        <Stat label="Votes">
          <NumberTicker value={contest.totalVotes} />
        </Stat>
        {presence === "Gated" ? (
          <Stat label="Checked in">
            <NumberTicker value={contest.checkedInCount} />
          </Stat>
        ) : null}
      </div>
      <dl className="text-footnote flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-fg-muted">Voting</dt>
          <dd>
            <Badge tone="accent">{PRESENCE_LABEL[presence].name}</Badge>
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-fg-muted">Room signal</dt>
          <dd className="text-fg text-right">
            {beacon ? (
              <>
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden className={cn("size-2 rounded-full", beacon.dot)} />
                  {beacon.text}
                </span>
                {beacon.sub ? <span className="text-fg-muted block">{beacon.sub}</span> : null}
              </>
            ) : (
              <span className="text-fg-muted">Not used</span>
            )}
          </dd>
        </div>
      </dl>
    </ControlCard>
  );
}
