import type { ReactNode } from "react";
import { cn } from "./cn";

export type BadgeTone = "neutral" | "accent" | "live" | "verified" | "warning" | "danger" | "prize";

// Fill = semantic colour at low alpha; text = the matching *-text token (≥ 4.5:1).
const tones: Record<BadgeTone, string> = {
  neutral: "bg-fg/6 text-fg-muted",
  accent: "bg-accent/12 text-accent",
  live: "bg-live/12 text-live-text",
  verified: "bg-verified/14 text-verified-text",
  warning: "bg-warning/18 text-warning-text",
  danger: "bg-danger/12 text-danger-text",
  prize: "bg-prize/20 text-prize-text",
};

export function Badge({
  tone = "neutral",
  icon,
  children,
  className,
}: {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "text-caption inline-flex h-6 items-center gap-1 rounded-full px-2.5 whitespace-nowrap [&_svg]:size-3.5",
        tones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
