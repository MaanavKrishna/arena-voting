"use client";

import { Check, Clock3, ListChecks, RotateCw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { AddressAvatar } from "@/components/ui/AddressChip";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useReducedMotionPref } from "@/components/ui/hooks";
import { explorerTxUrl } from "@/config/network";
import { cn } from "@/lib/cn";
import { shortAddress } from "@/lib/format";
import { fade, spring } from "@/lib/motion";
import type { QueueItem } from "@/hooks/useGate";

const STATUS_COPY: Record<QueueItem["status"], string> = {
  queued: "Waiting",
  sending: "Sending",
  pending: "Confirming",
  confirmed: "Confirmed",
  failed: "Didn't go through",
};

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** The Gate's side panel: every check-in from this device, newest first, with retry for failures. */
export function CheckInQueue({
  items,
  counts,
  onRetry,
  className,
}: {
  items: QueueItem[];
  counts: { waiting: number; confirmed: number; failed: number };
  onRetry: (id: number) => void;
  className?: string;
}) {
  const reduce = useReducedMotionPref();
  const list = [...items].reverse();

  return (
    <section aria-label="Check-ins" className={cn("solid squircle flex min-h-0 flex-col rounded-lg", className)}>
      <header className="border-border flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 className="text-title-3 text-fg">Check-ins</h2>
        <p className="text-footnote text-fg-muted tabular flex items-center gap-3" aria-live="polite">
          <span>
            <span className="text-fg">{counts.confirmed}</span> confirmed
          </span>
          {counts.waiting ? <span>{counts.waiting} on the way</span> : null}
          {counts.failed ? <span className="text-danger-text">{counts.failed} failed</span> : null}
        </p>
      </header>

      {list.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
          <span aria-hidden className="bg-fg/5 text-fg-muted grid size-10 place-items-center rounded-full">
            <ListChecks className="size-5" strokeWidth={1.75} />
          </span>
          <p className="text-callout text-fg">No one checked in yet</p>
          <p className="text-footnote text-fg-muted max-w-60">Each person you let in shows up here while it&rsquo;s saved.</p>
        </div>
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          <AnimatePresence initial={false}>
            {list.map((q) => (
              <motion.li
                key={q.id}
                layout={reduce ? false : "position"}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={reduce ? fade : spring.smooth}
                data-status={q.status}
                data-attempts={q.attempts}
                className="flex items-center gap-3 rounded-sm px-2 py-2.5"
              >
                <AddressAvatar address={q.voter} className="size-8" />
                <div className="min-w-0 flex-1">
                  <p className="text-mono text-fg truncate">{shortAddress(q.voter)}</p>
                  <p
                    className={cn(
                      "text-footnote",
                      q.status === "failed" ? "text-danger-text text-pretty" : "text-fg-muted truncate",
                    )}
                  >
                    {q.status === "failed" && q.error ? q.error : (q.note ?? STATUS_COPY[q.status])}
                    <span className="text-fg-subtle tabular"> · {clock(q.at)}</span>
                  </p>
                </div>
                <StatusIcon item={q} onRetry={onRetry} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}
    </section>
  );
}

function StatusIcon({ item, onRetry }: { item: QueueItem; onRetry: (id: number) => void }) {
  if (item.status === "failed") {
    return (
      <Button
        size="sm"
        variant="secondary"
        onClick={() => onRetry(item.id)}
        icon={<RotateCw className="size-3.5" strokeWidth={1.75} aria-hidden />}
        aria-label={`Retry check-in for ${shortAddress(item.voter)}`}
      >
        Retry
      </Button>
    );
  }
  if (item.status === "confirmed") {
    const url = item.hash ? explorerTxUrl(item.hash) : null;
    const icon = (
      <span className="bg-verified/15 text-verified-text grid size-7 place-items-center rounded-full">
        <Check className="size-4" strokeWidth={2.5} aria-label={STATUS_COPY.confirmed} />
      </span>
    );
    return url ? (
      <a href={url} target="_blank" rel="noreferrer" aria-label="Details">
        {icon}
      </a>
    ) : (
      icon
    );
  }
  if (item.status === "queued") {
    return (
      <span className="text-fg-muted grid size-7 place-items-center">
        <Clock3 className="size-4" strokeWidth={1.75} aria-label={STATUS_COPY.queued} />
      </span>
    );
  }
  return (
    <span className="text-fg-muted grid size-7 place-items-center">
      <Spinner className="size-4" label={STATUS_COPY[item.status]} />
    </span>
  );
}
