"use client";

import { Radio } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { useReducedMotionPref } from "@/components/ui/hooks";
import type { StageBeacon } from "@/hooks/useStageBeacon";
import { spring } from "@/lib/motion";
import type { Transmitter } from "./useTransmitter";

/**
 * The one big button: browsers only allow sound after a click (autoplay policy), so the Stage
 * waits here. Floats over the stage; the projected view stays visible behind the scrim.
 */
export function StartBeacon({ transmitter, beacon }: { transmitter: Transmitter; beacon: StageBeacon }) {
  const reduce = useReducedMotionPref();
  const waiting = beacon.slot === null && beacon.startsIn > 0;
  return (
    <div className="bg-scrim/60 fixed inset-0 z-20 grid place-items-center p-6" data-testid="start-beacon">
      <motion.div
        initial={{ opacity: 0, scale: reduce ? 1 : 0.96, filter: reduce ? "blur(0px)" : "blur(8px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={spring.smooth}
        className="glass-thick squircle flex max-w-lg flex-col items-center gap-6 rounded-xl px-10 py-10 text-center"
      >
        <span className="bg-accent/14 text-accent grid size-16 place-items-center rounded-full">
          <Radio className="size-8" strokeWidth={1.5} aria-hidden />
        </span>
        <div>
          <h2 className="text-title-1 text-fg">Room signal ready</h2>
          <p className="text-body text-fg-muted mt-2">
            {waiting
              ? "Start it now; it begins broadcasting the moment voting opens."
              : "Phones in the room listen for it to prove they're here. Keep this tab open and the volume up."}
          </p>
        </div>
        <Button
          size="lg"
          className="h-14 rounded-full px-8"
          onClick={transmitter.start}
          loading={transmitter.status === "starting"}
          autoFocus
        >
          Start beacon
        </Button>
        {transmitter.error ? <p className="text-footnote text-danger-text">{transmitter.error}</p> : null}
      </motion.div>
    </div>
  );
}
