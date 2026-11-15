"use client";

import { Download, ExternalLink, RotateCw, Volume2 } from "lucide-react";
import Link from "next/link";
import { AddressChip } from "@/components/ui/AddressChip";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Sheet } from "@/components/ui/Sheet";
import { Toggle } from "@/components/ui/Toggle";
import { currencyLabel, explorerAddressUrl } from "@/config/network";
import { AUDIBLE_PROTOCOL, DEFAULT_PROTOCOL, type SoundProtocol } from "@/lib/beacon/sound";
import { formatEth } from "@/lib/format";
import { RestoreFromFile } from "./BeaconSetup";
import type { BeaconController } from "./useBeaconController";
import type { useStageBurner } from "./useStageBurner";
import type { Transmitter } from "./useTransmitter";

type Burner = ReturnType<typeof useStageBurner>;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-title-3 text-fg">{title}</h3>
      {children}
    </section>
  );
}

function advanceText(a: Burner["advance"]): string {
  switch (a.status) {
    case "off":
      return "Off.";
    case "waiting":
      return "Waiting for the first refresh…";
    case "needs-funds":
      return "Paused: this Stage's wallet needs funds.";
    case "sending":
      return a.hops > 1 ? `Catching up in ${a.hops} steps…` : "Refreshing…";
    case "ok":
      return `Last refreshed at slot ${a.slot.toLocaleString("en-US")}.`;
    case "up-to-date":
      return "Up to date.";
    case "error":
      return a.message;
  }
}

/** Organiser drawer: sound, keeping the signal verified, the Stage wallet, and beacon recovery. */
export function StageControls({
  open,
  onOpenChange,
  contestId,
  needsBeacon,
  controller,
  transmitter,
  burner,
  advanceOn,
  onAdvanceChange,
  ended,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contestId: string;
  needsBeacon: boolean;
  controller: BeaconController;
  transmitter: Transmitter;
  burner: Burner;
  advanceOn: boolean;
  onAdvanceChange: (on: boolean) => void;
  ended: boolean;
}) {
  const on = transmitter.status === "on";
  const active = controller.active;
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Stage controls" description="Only you see this; close it before projecting.">
      <div className="flex flex-col gap-5" data-testid="stage-controls">
        {!needsBeacon ? (
          <p className="text-callout text-fg-muted">This contest lets anyone vote from anywhere, so there&apos;s no room signal to run.</p>
        ) : (
          <>
            <Section title="Sound">
              <div className="flex items-center justify-between gap-3">
                <p className="text-callout text-fg-muted">{on ? "Broadcasting." : "Off. Phones can still scan the screen code."}</p>
                {on ? (
                  <Button variant="secondary" size="sm" onClick={transmitter.stop}>
                    Stop sound
                  </Button>
                ) : (
                  <Button size="sm" onClick={transmitter.start} disabled={!active || ended} loading={transmitter.status === "starting"}>
                    Start beacon
                  </Button>
                )}
              </div>
              <SegmentedControl<SoundProtocol>
                aria-label="Sound type"
                stretch
                value={transmitter.protocol}
                onChange={transmitter.setProtocol}
                options={[
                  { value: DEFAULT_PROTOCOL, label: "Ultrasound" },
                  { value: AUDIBLE_PROTOCOL, label: "Audible chirp" },
                ]}
              />
              <p className="text-footnote text-fg-muted">
                Ultrasound is silent to people. Switch to the audible chirp if phones struggle to pick it up.
              </p>
              <label className="flex items-center gap-3">
                <Volume2 className="text-fg-muted size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                <span className="sr-only">Volume</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(transmitter.volume * 100)}
                  onChange={(e) => transmitter.setVolume(Number(e.target.value) / 100)}
                  className="accent-accent h-11 flex-1"
                />
                <span className="text-footnote text-fg-muted tabular w-10 text-right">{Math.round(transmitter.volume * 100)}%</span>
              </label>
            </Section>

            <Section title="Keep the signal verified">
              <Toggle
                checked={advanceOn}
                onCheckedChange={onAdvanceChange}
                label="Refresh every minute"
                description="This Stage's own wallet saves the newest code on the network, so votes stay quick and cheap."
              />
              <p className="text-footnote text-fg-muted" data-testid="advance-status">
                {advanceText(burner.advance)}
              </p>
            </Section>

            <Section title="Stage wallet">
              {burner.address ? (
                <>
                  <AddressChip address={burner.address} explorerUrl={explorerAddressUrl(burner.address) ?? undefined} label="Stage wallet" />
                  <p className="text-callout text-fg tabular" data-testid="burner-balance">
                    {burner.balance === undefined ? "Checking balance…" : `${formatEth(burner.balance)} ${currencyLabel}`}
                  </p>
                  <p className="text-footnote text-fg-muted">
                    Fund this Stage from Manage: copy the address above into “Fund the stage”. About 0.02 {currencyLabel} covers an event.
                  </p>
                  <Link
                    href={`/c/${contestId}/manage#stage-fund`}
                    target="_blank"
                    className="text-footnote text-accent inline-flex h-8 items-center gap-1 self-start underline-offset-4 hover:underline"
                  >
                    Open Manage
                    <ExternalLink className="size-3.5" strokeWidth={1.75} aria-hidden />
                  </Link>
                </>
              ) : (
                <p className="text-callout text-fg-muted">Preparing…</p>
              )}
            </Section>

            {active ? (
              <Section title="Beacon">
                <p className="text-footnote text-fg-muted">
                  Version {active.rotation}. Keep a backup if this computer might restart and you use a smart-contract wallet.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" icon={<Download className="size-4" strokeWidth={1.75} aria-hidden />} onClick={controller.downloadBackup}>
                    Download backup
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={ended}
                    icon={<RotateCw className="size-4" strokeWidth={1.75} aria-hidden />}
                    onClick={() => {
                      onOpenChange(false);
                      controller.startRotate();
                    }}
                  >
                    Rotate beacon
                  </Button>
                </div>
                <RestoreFromFile controller={controller} className="flex flex-col items-start gap-1" />
              </Section>
            ) : null}
          </>
        )}
      </div>
    </Sheet>
  );
}
