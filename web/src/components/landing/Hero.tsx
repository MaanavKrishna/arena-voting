"use client";

import { motion } from "motion/react";
import { ArrowRight, Compass } from "lucide-react";
import { Aurora } from "@/components/fx/hero/Aurora";
import { Spotlight } from "@/components/fx/hero/Spotlight";
import { useReducedMotionPref } from "@/components/ui/hooks";
import { spring, staggerDelay } from "@/lib/motion";
import { LinkButton } from "./LinkButton";

export function Hero() {
  const reduced = useReducedMotionPref();
  const item = (i: number) => ({
    initial: reduced ? { opacity: 0 } : { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: reduced ? { duration: 0.2 } : { ...spring.smooth, delay: 0.05 + staggerDelay(i) * 2 },
  });

  // The section is pulled up under the sticky nav (h-14 / md:h-16) so the aurora reaches the top edge;
  // the extra top padding gives that height back to the content.
  return (
    <section className="relative isolate -mt-14 overflow-hidden md:-mt-16">
      <Aurora
        intensity={0.2}
        className="[mask-image:linear-gradient(to_bottom,black_55%,transparent)]"
      />
      <Spotlight />
      <div className="max-w-content relative z-10 mx-auto flex flex-col items-center px-6 pt-34 pb-24 text-center md:pt-48 md:pb-36">
        <motion.p {...item(0)} className="text-caption-caps text-fg-muted mb-6">
          Contests on Ethereum
        </motion.p>
        <motion.h1 {...item(1)} className="text-display-xl text-fg">
          Arena
        </motion.h1>
        <motion.p {...item(2)} className="text-title-2 text-fg-muted mt-5 max-w-xl text-balance">
          Contests decided by the people in the room.
        </motion.p>
        <motion.div {...item(3)} className="mt-10 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row">
          <LinkButton href="/create" iconAfter={<ArrowRight className="size-5" strokeWidth={1.75} aria-hidden />}>
            Create a contest
          </LinkButton>
          <LinkButton href="/explore" variant="secondary" icon={<Compass className="size-5" strokeWidth={1.75} aria-hidden />}>
            Explore
          </LinkButton>
        </motion.div>
      </div>
    </section>
  );
}
