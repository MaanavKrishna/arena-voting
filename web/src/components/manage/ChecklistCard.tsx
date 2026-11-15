"use client";

import { Check, ChevronRight, ListChecks } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { cn } from "@/components/ui/cn";
import { useReducedMotionPref } from "@/components/ui/hooks";
import { spring } from "@/lib/motion";
import type { ChecklistId, ChecklistItem } from "./checklist";
import { ControlCard } from "./ControlCard";

function targetFor(id: ChecklistId, contestId: string): { href: string; label: string } {
  switch (id) {
    case "entries":
      return { href: "#entries", label: "Go to entries" };
    case "stage":
      return { href: `/c/${contestId}/stage`, label: "Open the Stage" };
    case "gate":
      return { href: `/c/${contestId}/gate`, label: "Open the Gate" };
    case "share":
      return { href: "#share", label: "Go to sharing" };
  }
}

export function ChecklistCard({ contestId, items }: { contestId: string; items: ChecklistItem[] }) {
  const reduced = useReducedMotionPref();
  const done = items.filter((i) => i.done).length;
  const complete = done === items.length;

  return (
    <ControlCard
      id="checklist"
      icon={<ListChecks strokeWidth={1.75} />}
      title="Get ready"
      description={complete ? "Everything is set. You're good to go." : `${done} of ${items.length} done`}
    >
      <ol className="-my-1 flex flex-col">
        {items.map((item) => {
          const target = targetFor(item.id, contestId);
          return (
            <li key={item.id}>
              <Link
                href={target.href}
                aria-label={`${item.title}: ${item.done ? "done" : "to do"}. ${target.label}`}
                className="hover:bg-fg/4 -mx-2 flex min-h-14 items-center gap-3 rounded-sm px-2 py-2 transition-colors duration-150"
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full border transition-colors duration-200",
                    item.done ? "bg-verified border-verified text-accent-fg" : "border-border-strong",
                  )}
                >
                  <AnimatePresence initial={false}>
                    {item.done ? (
                      <motion.span
                        key="tick"
                        initial={reduced ? false : { scale: 0.4, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={spring.snappy}
                      >
                        <Check className="size-3.5" strokeWidth={3} />
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("text-callout block", item.done ? "text-fg-muted" : "text-fg font-medium")}>{item.title}</span>
                  <span className="text-footnote text-fg-muted block truncate">{item.hint}</span>
                </span>
                <ChevronRight className="text-fg-subtle size-4 shrink-0" strokeWidth={1.75} aria-hidden />
              </Link>
            </li>
          );
        })}
      </ol>
    </ControlCard>
  );
}
