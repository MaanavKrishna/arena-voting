"use client";

import { AudioLines } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { PRESENCE_GATED } from "./contestLogic";

export type PresenceSlotProps = {
  contestId: bigint;
  /** 1 = Room, 2 = Gated. */
  presence: number;
  className?: string;
};

/**
 * PRESENCE SLOT — placeholder owned by the Ground (presence) task, which replaces this component.
 * It sits wherever a Room/Gated voter needs to prove presence (page action area and the entry
 * sheet). The contest page treats presence as "not ready" until the replacement reports a valid
 * beacon token; the vote is built with `voteArgs(..., beacon)` from contestLogic.ts.
 */
export function PresenceSlot({ contestId, presence, className }: PresenceSlotProps) {
  return (
    <div
      data-slot="presence"
      data-contest={contestId.toString()}
      className={cn("glass-thin flex items-center gap-3 rounded-md px-4 py-3", className)}
    >
      <span className="bg-fg/6 text-fg-muted grid size-9 shrink-0 place-items-center rounded-full">
        <AudioLines aria-hidden className="size-4.5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0">
        <p className="text-callout text-fg">Room check coming soon</p>
        <p className="text-footnote text-fg-muted">
          {presence === PRESENCE_GATED
            ? "This contest needs a door check-in and proof you're in the room before you can vote."
            : "This contest needs proof you're in the room before you can vote."}
        </p>
      </div>
    </div>
  );
}
