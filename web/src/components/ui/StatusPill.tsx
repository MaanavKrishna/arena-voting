import { Check } from "lucide-react";
import { cn } from "./cn";

export type Status = "live" | "upcoming" | "ended" | "verified";

const config: Record<Status, { label: string; pill: string; dot: string }> = {
  live: { label: "Live", pill: "bg-live/12 text-live-text", dot: "bg-live" },
  upcoming: { label: "Upcoming", pill: "bg-accent/12 text-accent", dot: "bg-accent" },
  ended: { label: "Ended", pill: "bg-fg/6 text-fg-muted", dot: "bg-fg-subtle" },
  verified: { label: "In the room", pill: "bg-verified/14 text-verified-text", dot: "bg-verified" },
};

/** Contest/presence status. Live pulses its Ember dot (static under reduced motion). */
export function StatusPill({ status, label, className }: { status: Status; label?: string; className?: string }) {
  const c = config[status];
  return (
    <span
      className={cn(
        "text-caption inline-flex h-6 items-center gap-1.5 rounded-full pr-2.5 pl-2 whitespace-nowrap",
        c.pill,
        className,
      )}
    >
      {status === "verified" ? (
        <Check aria-hidden className="size-3.5" strokeWidth={2.5} />
      ) : (
        <span aria-hidden className="relative inline-flex size-1.5">
          {status === "live" ? (
            <span className={cn("animate-live-pulse absolute inset-0 rounded-full", c.dot)} />
          ) : null}
          <span className={cn("relative inline-flex size-1.5 rounded-full", c.dot)} />
        </span>
      )}
      {label ?? c.label}
    </span>
  );
}
