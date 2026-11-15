import { Radio, ScanSearch, ShieldCheck } from "lucide-react";

const POINTS = [
  { icon: ShieldCheck, title: "Rules live on Ethereum", body: "Votes, tallies and payouts are enforced by the contract, not by us." },
  { icon: ScanSearch, title: "Check it yourself", body: "Every contest and vote can be verified on the public block explorer." },
  { icon: Radio, title: "Presence is proven", body: "In-room contests check that voters are actually there, using a sound only the room can hear." },
] as const;

export function TrustStrip() {
  return (
    <section aria-labelledby="trust-heading" className="max-w-content mx-auto w-full px-4 pb-16 md:px-8 md:pb-24">
      <div className="border-fg/8 border-y py-10 md:py-12">
        <h2 id="trust-heading" className="text-caption-caps text-fg-muted mb-8">
          Why trust it
        </h2>
        <ul className="grid gap-8 md:grid-cols-3 md:gap-10">
          {POINTS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-4">
              <span className="bg-accent/10 text-accent grid size-10 shrink-0 place-items-center rounded-full">
                <Icon className="size-5" strokeWidth={1.75} aria-hidden />
              </span>
              <div>
                <p className="text-callout text-fg font-medium">{title}</p>
                <p className="text-footnote text-fg-muted mt-1 text-pretty">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
