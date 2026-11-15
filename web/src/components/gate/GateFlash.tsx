"use client";

import { Check, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotionPref } from "@/components/ui/hooks";
import { cn } from "@/lib/cn";
import { shortAddress } from "@/lib/format";
import { fade, spring } from "@/lib/motion";
import { REJECT_COPY, type Flash } from "@/hooks/useGate";

/**
 * Full-screen result: green for in, red with the reason for a rejection. It never takes input,
 * so staff can keep working the side panel while it plays.
 */
export function GateFlash({ flash }: { flash: Flash | null }) {
  const reduce = useReducedMotionPref();
  const ok = flash?.kind === "accepted";
  const copy = flash?.kind === "rejected" ? REJECT_COPY[flash.reason] : null;

  return (
    <div aria-live="assertive" className="pointer-events-none fixed inset-0 z-50">
      <AnimatePresence>
        {flash ? (
          <motion.div
            key={flash.at}
            data-gate-flash={flash.kind}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduce ? fade : { ...spring.snappy, visualDuration: 0.12 }}
            className={cn(
              "absolute inset-0 flex flex-col items-center justify-center gap-5 px-6 text-center",
              ok ? "bg-verified text-bg" : "bg-danger text-bg",
            )}
          >
            <motion.span
              initial={reduce ? false : { scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={ok ? spring.celebrate : spring.snappy}
              className="bg-bg/15 grid size-28 place-items-center rounded-full md:size-36"
            >
              {ok ? (
                <Check className="size-16 md:size-20" strokeWidth={2.75} aria-hidden />
              ) : (
                <X className="size-16 md:size-20" strokeWidth={2.75} aria-hidden />
              )}
            </motion.span>
            <motion.div
              initial={reduce ? false : { y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ ...spring.smooth, delay: reduce ? 0 : 0.03 }}
              className="flex flex-col items-center gap-2"
            >
              <p className="text-display">{ok ? "Checked in" : copy?.title}</p>
              {flash.voter ? <p className="text-title-2 font-mono opacity-80">{shortAddress(flash.voter)}</p> : null}
              {copy ? <p className="text-title-3 max-w-md opacity-85">{copy.hint}</p> : null}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
