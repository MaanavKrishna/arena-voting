"use client";

import { Check, Trophy } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { NumberTicker } from "@/components/fx/NumberTicker";
import { TiltCard } from "@/components/fx/TiltCard";
import { cn } from "@/components/ui/cn";
import { Spinner } from "@/components/ui/Spinner";
import { spring } from "@/lib/motion";
import { EntryImage } from "./EntryImage";

/** Where this card is in the vote flow. */
export type EntryVoteState = "idle" | "confirm" | "sending" | "voted";

export type EntryCardProps = {
  entryId: number;
  name: string;
  tagline: string;
  image: string | undefined;
  votes: number;
  /** CSS colour of the entry (dot + image tint). */
  color: string;
  voteState?: EntryVoteState;
  winner?: boolean;
  /** Metadata still loading: show text skeletons instead of the fallback name. */
  loading?: boolean;
  onOpen: () => void;
};

function StatePill({ state, winner }: { state: EntryVoteState; winner?: boolean }) {
  const content =
    state === "confirm"
      ? { key: "confirm", cls: "bg-accent/12 text-accent", icon: <Spinner className="size-3" />, text: "Confirm in wallet" }
      : state === "sending"
        ? { key: "sending", cls: "bg-accent/12 text-accent", icon: <Spinner className="size-3" />, text: "Sending…" }
        : state === "voted"
          ? {
              key: "voted",
              cls: "bg-verified/14 text-verified-text",
              icon: <Check className="size-3.5" strokeWidth={2.5} aria-hidden />,
              text: "Your vote",
            }
          : winner
            ? {
                key: "winner",
                cls: "bg-prize/20 text-prize-text",
                icon: <Trophy className="size-3.5" strokeWidth={2} aria-hidden />,
                text: "Winner",
              }
            : null;
  return (
    <AnimatePresence initial={false} mode="popLayout">
      {content ? (
        <motion.span
          key={content.key}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={spring.snappy}
          className={cn("text-caption inline-flex h-6 items-center gap-1 rounded-full px-2.5 whitespace-nowrap", content.cls)}
        >
          {content.icon}
          {content.text}
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}

/** One entry in the gallery: tilts toward the pointer on desktop, opens the entry sheet on tap. */
export function EntryCard({
  entryId,
  name,
  tagline,
  image,
  votes,
  color,
  voteState = "idle",
  winner,
  loading,
  onOpen,
}: EntryCardProps) {
  return (
    <TiltCard className="rounded-md">
      <button
        type="button"
        onClick={onOpen}
        data-entry-card={entryId}
        aria-label={`${name}, ${votes} ${votes === 1 ? "vote" : "votes"}${voteState === "voted" ? ", your vote" : ""}${winner ? ", winner" : ""}`}
        className={cn(
          "solid squircle shadow-sm group relative flex h-full w-full flex-col rounded-md p-3 text-left",
          "transition-[box-shadow,transform] duration-200 ease-out hover:shadow-md active:scale-[0.98]",
          "focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2",
          voteState === "voted" && "ring-verified/60 ring-2",
          (voteState === "sending" || voteState === "confirm") && "ring-accent/50 ring-2",
          winner && voteState !== "voted" && "ring-prize/70 ring-2",
        )}
      >
        <EntryImage uri={image} name={name} color={color} />
        <div className="flex flex-1 flex-col gap-1 px-1 pt-4 pb-1">
          {loading ? (
            <span aria-hidden className="flex flex-col gap-2">
              <span className="bg-fg/7 block h-5 w-2/3 rounded-xs" />
              <span className="bg-fg/7 block h-3.5 w-5/6 rounded-xs" />
            </span>
          ) : (
            <>
              <h3 className="text-title-3 text-fg line-clamp-1">{name}</h3>
              {tagline ? <p className="text-footnote text-fg-muted line-clamp-2">{tagline}</p> : null}
            </>
          )}
          <div className="mt-auto flex items-center justify-between gap-2 pt-3">
            <span className="text-footnote text-fg-muted inline-flex items-center gap-2">
              <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-fg tabular font-medium">
                <NumberTicker value={votes} />
              </span>
              {votes === 1 ? "vote" : "votes"}
            </span>
            <StatePill state={voteState} winner={winner} />
          </div>
        </div>
      </button>
    </TiltCard>
  );
}
