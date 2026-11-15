"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import { NumberTicker } from "@/components/fx/NumberTicker";
import { Hemicycle, colourVar } from "@/components/ui/Hemicycle";
import { percentOf } from "@/components/ui/RankedList";
import { Skeleton } from "@/components/ui/Skeleton";
import { useReducedMotionPref } from "@/components/ui/hooks";
import { entryName, rankEntries, resultsModel } from "@/components/contest/contestLogic";
import type { EntryWithMetadata } from "@/hooks/useEntries";
import { fade, spring } from "@/lib/motion";
import type { Phase } from "@/lib/phase";

const TOP = 5;

/** Live hemicycle with the vote total in its arc, and the top five underneath at projector size. */
export function StageResults({
  entries,
  loading,
  phase,
}: {
  entries: EntryWithMetadata[] | undefined;
  loading: boolean;
  phase: Phase | undefined;
}) {
  const reduce = useReducedMotionPref();
  const model = useMemo(() => {
    const list = entries ?? [];
    const m = resultsModel(list);
    const names = new Map(list.map((e) => [e.id, entryName(e)] as const));
    const ranked = rankEntries(list).slice(0, TOP);
    return { ...m, names, ranked };
  }, [entries]);

  const live = phase === "voting";
  const closed = phase === "ended" || phase === "finalized";

  return (
    <div className="relative flex h-full min-h-0 flex-col p-6 md:p-8">
      <div className="flex items-center justify-between">
        <h2 className="text-title-2 text-fg">{closed ? "Final standings" : "Live results"}</h2>
        {live ? (
          <span className="text-footnote text-fg-muted inline-flex items-center gap-2">
            <span aria-hidden className="relative inline-flex size-2">
              <span className="animate-live-pulse bg-live absolute inset-0 rounded-full" />
              <span className="bg-live relative inline-flex size-2 rounded-full" />
            </span>
            Updating live
          </span>
        ) : null}
      </div>

      {loading && !entries ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          <Skeleton className="aspect-[2/1] w-full max-w-xl rounded-t-full" />
          <Skeleton className="h-40 w-full max-w-xl" />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center gap-4 pt-2">
          {/* Sized by the panel's height on a projector, by its width on a phone. */}
          <div className="flex min-h-0 w-full flex-1 items-center justify-center">
          <Hemicycle
            className="aspect-[11/6] max-h-full w-full max-w-2xl lg:h-full lg:w-auto"
            counts={model.counts}
            colours={model.colours}
            names={model.names}
          >
            <span className="text-numeric-xl text-fg tabular">
              <NumberTicker value={model.total} />
            </span>
            <span className="text-callout text-fg-muted">{model.total === 1 ? "vote" : "votes"}</span>
          </Hemicycle>
          </div>

          {model.ranked.length === 0 ? (
            <p className="text-title-3 text-fg-muted pb-6">Entries appear here as soon as they&apos;re in.</p>
          ) : (
            <ol aria-label="Top five" className="flex w-full max-w-2xl shrink-0 flex-col">
              <AnimatePresence initial={false}>
                {model.ranked.map((e) => {
                  const pct = percentOf(e.votes, model.total);
                  const colour = colourVar(model.colours.get(e.id));
                  return (
                    <motion.li
                      key={e.id}
                      layout={reduce ? false : "position"}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: fade }}
                      transition={spring.smooth}
                      data-entry={e.id}
                      className="flex items-center gap-4 py-1.5"
                    >
                      <span className="text-title-3 text-fg-subtle tabular w-6 text-right" aria-hidden>
                        {e.rank}
                      </span>
                      <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ backgroundColor: colour }} />
                      <span className="min-w-0 flex-1">
                        <span className="text-title-3 text-fg block truncate">{model.names.get(e.id)}</span>
                        <span aria-hidden className="bg-fg/7 mt-1.5 block h-1 overflow-hidden rounded-full">
                          <motion.span
                            className="block h-full origin-left rounded-full"
                            style={{ backgroundColor: colour }}
                            initial={false}
                            animate={{ scaleX: pct / 100 }}
                            transition={spring.smooth}
                          />
                        </span>
                      </span>
                      <span className="flex w-24 shrink-0 flex-col items-end">
                        <NumberTicker value={e.votes} className="text-title-2 text-fg" />
                        <span className="text-caption text-fg-muted tabular">{pct}%</span>
                      </span>
                      <span className="sr-only">{`Rank ${e.rank}, ${e.votes} ${e.votes === 1 ? "vote" : "votes"}`}</span>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
