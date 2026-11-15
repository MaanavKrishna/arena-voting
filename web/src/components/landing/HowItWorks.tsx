import { ArrowRight, Check, Lock, Trophy } from "lucide-react";
import { BentoGrid, BentoItem } from "@/components/ui/BentoGrid";
import { currencyLabel } from "@/config/network";

/** Prize sealed in a vault ring. */
function LockVisual() {
  return (
    <div aria-hidden className="relative grid size-28 place-items-center">
      <span className="border-prize/40 absolute inset-0 rounded-full border-2 border-dashed" />
      <span className="bg-prize/15 absolute inset-3 rounded-full" />
      <span className="bg-bg-elevated shadow-md relative grid size-14 place-items-center rounded-full">
        <Lock className="text-prize-text size-6" strokeWidth={1.75} />
      </span>
      <span className="bg-prize text-fg text-caption shadow-sm absolute -right-3 bottom-2 rounded-full px-2 py-0.5">
        {currencyLabel}
      </span>
    </div>
  );
}

/** A little crowd of voters, each in an entry colour, with the room ring around them. */
function RoomVisual() {
  const dots = [1, 2, 3, 4, 5, 6, 7, 8, 1, 3, 5, 2];
  return (
    <div aria-hidden className="relative grid size-28 place-items-center">
      <span className="border-verified/50 absolute inset-0 rounded-full border-2" />
      <span className="border-verified/25 absolute -inset-2.5 rounded-full border" />
      <div className="grid grid-cols-4 gap-1.5">
        {dots.map((n, i) => (
          <span
            key={i}
            className="size-4 rounded-full"
            style={{ backgroundColor: `var(--color-entry-${n})`, opacity: i === 5 ? 1 : 0.55 }}
          />
        ))}
      </div>
      <span className="bg-verified text-accent-fg shadow-sm absolute -right-2 -bottom-1 grid size-6 place-items-center rounded-full">
        <Check className="size-3.5" strokeWidth={3} />
      </span>
    </div>
  );
}

/** Prize moving from the contest to the winner. */
function PayoutVisual() {
  return (
    <div aria-hidden className="flex items-center gap-3">
      <span className="bg-prize/20 text-prize-text grid size-12 place-items-center rounded-full">
        <Trophy className="size-6" strokeWidth={1.75} />
      </span>
      <span className="flex items-center text-fg-subtle">
        <span className="bg-fg/15 h-px w-5" />
        <span className="bg-fg/15 h-px w-3" />
        <ArrowRight className="size-4" strokeWidth={1.75} />
      </span>
      <span className="solid squircle shadow-sm text-callout text-fg tabular rounded-sm px-3 py-2">+ prize</span>
    </div>
  );
}

export function HowItWorks() {
  return (
    <section aria-labelledby="how-heading" className="max-w-content mx-auto w-full px-4 py-16 md:px-8 md:py-24">
      <div className="mb-10 max-w-xl">
        <p className="text-caption-caps text-fg-muted mb-3">How it works</p>
        <h2 id="how-heading" className="text-display text-fg text-balance">
          Three steps, no middleman.
        </h2>
      </div>
      <BentoGrid>
        <BentoItem
          eyebrow="1"
          visual={<LockVisual />}
          title="Lock the prize"
          description="The organiser puts the prize in the contract before anyone enters. It can't be taken back or quietly changed."
        />
        <BentoItem
          eyebrow="2"
          visual={<RoomVisual />}
          title="Vote in the room"
          description="People vote from their own phones, and the room can prove they're really there. One person, one vote."
        />
        <BentoItem
          eyebrow="3"
          visual={<PayoutVisual />}
          title="Winner gets paid automatically"
          description="When voting closes, anyone can finish the contest and the prize goes straight to the winner."
        />
      </BentoGrid>
    </section>
  );
}
