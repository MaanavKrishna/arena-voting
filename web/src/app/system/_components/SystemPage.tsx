"use client";

import { ArrowLeft } from "lucide-react";
import { MotionConfig } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/components/ui/cn";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Toggle } from "@/components/ui/Toggle";
import { ColorSection } from "./ColorSection";
import { ComponentsSection } from "./ComponentsSection";
import { EffectsSection, SlotsSection } from "./EffectsSection";
import { LayoutSection, MaterialsSection, TypeSection } from "./FoundationSections";
import { MotionSection } from "./MotionSection";

const nav = [
  ["colour", "Colour"],
  ["type", "Type"],
  ["space", "Space"],
  ["materials", "Materials"],
  ["motion", "Motion"],
  ["components", "Components"],
  ["effects", "Effects"],
] as const;

export function SystemPage() {
  const [reduced, setReduced] = useState(false);

  return (
    <MotionConfig reducedMotion={reduced ? "always" : "user"}>
      <div data-motion={reduced ? "reduce" : undefined} className="min-h-dvh">
        <header className="glass sticky top-0 z-30 border-x-0 border-t-0">
          <div className="max-w-content mx-auto flex h-14 items-center gap-4 px-4 md:px-8">
            <Link
              href="/"
              className="text-callout text-fg hover:text-fg-muted inline-flex min-h-11 items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="size-4" strokeWidth={1.75} aria-hidden />
              Arena
            </Link>
            <nav aria-label="Sections" className="hidden flex-1 items-center justify-center gap-1 lg:flex">
              {nav.map(([id, label]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="text-footnote text-fg-muted hover:text-fg hover:bg-fg/5 rounded-full px-3 py-1.5 transition-colors"
                >
                  {label}
                </a>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-3 lg:ml-0">
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="max-w-content mx-auto px-4 md:px-8">
          <div className="border-border border-b pt-14 pb-12 md:pt-24 md:pb-16">
            <p className="text-caption-caps text-accent mb-4">Arena design system</p>
            <h1 className="text-display text-fg max-w-3xl text-balance">Calm by default, spectacular on purpose.</h1>
            <p className="text-body text-fg-muted mt-4 max-w-prose text-pretty">
              The living reference for every token, component and effect. If it isn&apos;t here, it isn&apos;t in the
              system yet.
            </p>
            <div className="mt-8 max-w-sm">
              <Toggle
                label="Reduced motion preview"
                description="Springs become fades; ambient effects stop"
                checked={reduced}
                onCheckedChange={setReduced}
              />
            </div>
          </div>

          <div className={cn("divide-border divide-y")}>
            <ColorSection />
            <TypeSection />
            <LayoutSection />
            <MaterialsSection />
            <MotionSection />
            <ComponentsSection />
            <EffectsSection reduced={reduced} onReducedChange={setReduced} />
            <SlotsSection />
          </div>
        </main>

        <footer className="max-w-content text-footnote text-fg-muted mx-auto px-4 pt-6 pb-16 md:px-8">
          Tokens: web/src/lib/tokens.ts · globals.css · motion.ts
        </footer>
      </div>
    </MotionConfig>
  );
}
