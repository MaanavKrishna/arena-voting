"use client";

import { Minus, Plus, Radio as RadioIcon } from "lucide-react";
import { useState } from "react";
import { ListeningOrb, type OrbState } from "@/components/fx/ListeningOrb";
import { NumberTicker } from "@/components/fx/NumberTicker";
import { TiltCard } from "@/components/fx/TiltCard";
import { Aurora } from "@/components/fx/hero/Aurora";
import { BorderBeam } from "@/components/fx/hero/BorderBeam";
import { Spotlight } from "@/components/fx/hero/Spotlight";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { StatusPill } from "@/components/ui/StatusPill";
import { Toggle } from "@/components/ui/Toggle";
import { Demo, Section } from "./Section";

type Hero = "none" | "spotlight" | "aurora" | "beam";

function HeroStage({ hero }: { hero: Hero }) {
  return (
    <div className="bg-bg-sunken border-border squircle relative isolate flex min-h-72 flex-col items-center justify-center overflow-hidden rounded-xl border px-6 py-14 text-center md:min-h-80">
      {hero === "aurora" ? <Aurora /> : null}
      {hero === "spotlight" ? <Spotlight /> : null}
      {hero === "beam" ? <BorderBeam /> : null}
      <div className="relative flex flex-col items-center gap-3">
        {hero === "beam" ? <StatusPill status="live" label="Live now" /> : null}
        <p className="text-display text-fg">Demo Night</p>
        <p className="text-callout text-fg-muted max-w-sm">
          {hero === "spotlight"
            ? "Move the pointer across the stage. Static on touch."
            : hero === "aurora"
              ? "Three slow blobs: 23s, 31s and 37s cycles, at most 0.35 opacity."
              : hero === "beam"
                ? "A light laps the border every 6 seconds."
                : "Calm by default. Pick an effect above."}
        </p>
      </div>
    </div>
  );
}

export function EffectsSection({
  reduced,
  onReducedChange,
}: {
  reduced: boolean;
  onReducedChange: (v: boolean) => void;
}) {
  const [hero, setHero] = useState<Hero>("aurora");
  const [votes, setVotes] = useState(128);
  const [prize, setPrize] = useState(1.25);
  const [orb, setOrb] = useState<OrbState>("listening");
  const [pulse, setPulse] = useState(0);
  const [tilt, setTilt] = useState(true);

  return (
    <Section
      id="effects"
      index="07"
      title="Effects"
      description="Spectacular on purpose: at most one ambient hero effect per screen. Every effect pauses off-screen and in background tabs, and has a reduced-motion fallback."
    >
      <div className="solid squircle mb-4 flex flex-col gap-4 rounded-lg p-5 md:mb-6 md:flex-row md:items-center md:justify-between md:p-6">
        <div className="flex flex-col gap-2">
          <span className="text-footnote text-fg">Hero effect (one at a time)</span>
          <SegmentedControl<Hero>
            aria-label="Hero effect"
            value={hero}
            onChange={setHero}
            options={[
              { value: "none", label: "Off" },
              { value: "spotlight", label: "Spotlight" },
              { value: "aurora", label: "Aurora" },
              { value: "beam", label: "Beam" },
            ]}
          />
        </div>
        <Toggle
          className="md:w-72"
          label="Reduced motion preview"
          description="Forces the fallback on this page"
          checked={reduced}
          onCheckedChange={onReducedChange}
        />
      </div>

      <HeroStage hero={hero} />

      <div className="mt-4 grid gap-4 md:grid-cols-3 lg:mt-6 lg:gap-6">
        <Demo title="NumberTicker" note="Spring on the value">
          <div className="flex items-baseline gap-2">
            <NumberTicker value={votes} className="text-display text-fg" />
            <span className="text-callout text-fg-muted">votes</span>
          </div>
          <div className="flex items-baseline gap-2">
            <NumberTicker value={prize} decimals={2} className="text-title-1 text-prize-text" />
            <span className="text-callout text-fg-muted">ETH prize</span>
          </div>
          <div className="mt-auto flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={<Plus className="size-3.5" strokeWidth={2} aria-hidden />} onClick={() => setVotes((v) => v + 1)}>
              Vote
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setVotes((v) => v + 37)}>
              +37
            </Button>
            <Button size="sm" variant="ghost" icon={<Minus className="size-3.5" strokeWidth={2} aria-hidden />} onClick={() => setPrize((p) => Math.max(0, p - 0.25))}>
              Prize
            </Button>
          </div>
        </Demo>

        <Demo title="ListeningOrb" note="Presence chip">
          <div className="glass-thin inline-flex h-9 items-center gap-2 self-start rounded-full pr-3.5 pl-2.5">
            <ListeningOrb state={orb} pulseKey={pulse} />
            <span className="text-footnote text-fg">
              {orb === "verified" ? "In the room" : orb === "listening" ? "Listening…" : "Not listening"}
            </span>
          </div>
          <SegmentedControl<OrbState>
            aria-label="Orb state"
            size="sm"
            value={orb}
            onChange={setOrb}
            options={[
              { value: "idle", label: "Idle" },
              { value: "listening", label: "Listening" },
              { value: "verified", label: "Verified" },
            ]}
          />
          <div className="mt-auto">
            <Button
              size="sm"
              variant="secondary"
              icon={<RadioIcon className="size-3.5" strokeWidth={1.75} aria-hidden />}
              onClick={() => setPulse((p) => p + 1)}
            >
              Token received
            </Button>
          </div>
        </Demo>

        <Demo title="TiltCard" note="Desktop pointer only">
          <Toggle label="Tilt on" checked={tilt} onCheckedChange={setTilt} />
          {tilt ? (
            <TiltCard className="rounded-md">
              <div
                className="squircle flex aspect-4/3 flex-col justify-end rounded-md p-4"
                style={{
                  backgroundImage:
                    "radial-gradient(80% 90% at 20% 10%, var(--color-entry-6), transparent), radial-gradient(70% 80% at 90% 90%, var(--color-entry-1), transparent), linear-gradient(var(--color-bg-sunken), var(--color-bg-sunken))",
                }}
              >
                <span className="text-title-3 text-fg">Lumen</span>
                <span className="text-footnote text-fg-muted">Live polls for any classroom</span>
              </div>
            </TiltCard>
          ) : (
            <div className="bg-bg-sunken squircle grid aspect-4/3 place-items-center rounded-md">
              <span className="text-footnote text-fg-muted">Tilt off</span>
            </div>
          )}
        </Demo>
      </div>
    </Section>
  );
}

const slots = [
  { name: "TxButton", task: "Task 9", body: "connect → wrong network → ready → confirm in wallet → pending → confirmed → error" },
  { name: "ConnectSheet", task: "Task 9", body: "Installed wallets (EIP-6963), WalletConnect QR or deep link, “What's a wallet?”" },
  { name: "PresenceChip", task: "Task 15", body: "idle → listening (ListeningOrb) → in the room ✓ → stale → mic denied (offer QR)" },
  { name: "Hemicycle", task: "Task 12", body: "One seat per vote, slider for 0–800 votes and an “add vote” button" },
];

export function SlotsSection() {
  return (
    <Section
      id="coming"
      index="08"
      title="Coming next"
      description="Wallet and contract components land with their tasks. Their slots are reserved here so the page stays the single place to review the system."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
        {slots.map((s) => (
          <div key={s.name} className="border-border-strong/40 squircle flex flex-col gap-2 rounded-md border border-dashed p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-title-3 text-fg">{s.name}</span>
              <span className="text-caption text-fg-muted">{s.task}</span>
            </div>
            <p className="text-footnote text-fg-muted">{s.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
