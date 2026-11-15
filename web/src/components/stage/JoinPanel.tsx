"use client";

import { QRCodeSVG } from "qrcode.react";
import { NumberTicker } from "@/components/fx/NumberTicker";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import { useIsClient } from "@/components/ui/hooks";

/** "Scan to vote": the contest link as a big QR, plus the room's counters. */
export function JoinPanel({
  contestId,
  votes,
  checkedIn,
  className,
}: {
  contestId: string;
  votes: number;
  /** Gated contests only; null hides the counter. */
  checkedIn: number | null;
  className?: string;
}) {
  const client = useIsClient();
  const url = client ? `${window.location.origin}/c/${contestId}` : "";
  const shown = url.replace(/^https?:\/\//, "");

  return (
    <section aria-label="Join" className={cn("flex min-h-0 flex-col gap-5 md:gap-6", className)}>
      <div className="solid squircle flex min-h-0 flex-1 flex-col items-center justify-center gap-5 rounded-xl p-6 md:p-8">
        <div
          className="bg-fg text-bg squircle aspect-square w-full max-w-60 shrink rounded-lg p-4 shadow-lg lg:h-full lg:max-h-80 lg:w-auto lg:max-w-full lg:min-h-0"
          data-testid="join-qr"
        >
          {url ? (
            <QRCodeSVG
              value={url}
              level="M"
              marginSize={0}
              bgColor="transparent"
              fgColor="currentColor"
              className="block size-full"
              title={`Scan to open ${shown}`}
            />
          ) : (
            <Skeleton className="size-full" />
          )}
        </div>
        <div className="shrink-0 text-center">
          <p className="text-display text-fg">Scan to vote</p>
          <p className="text-title-3 text-fg-muted mt-1 font-mono break-all">{shown || " "}</p>
        </div>
      </div>

      <div className={cn("grid shrink-0 gap-5 md:gap-6", checkedIn === null ? "grid-cols-1" : "grid-cols-2")}>
        <Counter label={votes === 1 ? "vote" : "votes"} value={votes} />
        {checkedIn !== null ? <Counter label="checked in" value={checkedIn} /> : null}
      </div>
    </section>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="solid squircle flex items-baseline gap-4 rounded-xl px-6 py-4 md:px-8">
      <NumberTicker value={value} className="text-numeric-xl text-fg" />
      <span className="text-title-2 text-fg-muted">{label}</span>
    </div>
  );
}
