"use client";

import { AlertTriangle, Clock, Wallet } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import { useReducedMotionPref } from "@/components/ui/hooks";
import type { StageBeacon } from "@/hooks/useStageBeacon";
import { SLOT_SECONDS } from "@/lib/beacon/chain";
import { cachedSlot, type OnChainBeacon } from "@/lib/beacon/stage";
import { fade } from "@/lib/motion";
import type { ActiveBeacon, Flow } from "./useBeaconController";
import type { useStageBurner } from "./useStageBurner";
import type { Transmitter } from "./useTransmitter";

type Burner = ReturnType<typeof useStageBurner>;

/** Seconds since the newest link the contract has verified (its slot start), or null if none yet. */
export function verifiedAgo(onChain: OnChainBeacon | null, now: bigint): number | null {
  if (!onChain) return null;
  const s = cachedSlot(onChain);
  if (s === null) return null;
  const at = onChain.start + BigInt(s * SLOT_SECONDS);
  return Math.max(0, Number(now - at));
}

function agoText(s: number): string {
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return `${Math.floor(s / 3600)} h ago`;
}

/**
 * Bottom strip: rotating fallback QR, "Signal on · slot N · last verified X s ago", a live waveform
 * and warning chips. Listening phones can't be counted, so it reports what the Stage knows.
 */
export function BeaconStatusBar({
  beacon,
  active,
  onChain,
  flow,
  transmitter,
  burner,
  ended,
  onOpenControls,
}: {
  beacon: StageBeacon;
  active: ActiveBeacon | null;
  onChain: OnChainBeacon | null;
  flow: Flow;
  transmitter: Transmitter;
  burner: Burner;
  ended: boolean;
  onOpenControls: () => void;
}) {
  const on = transmitter.status === "on";
  const ago = verifiedAgo(onChain, beacon.now);
  const lowFunds = burner.advance.status === "needs-funds" || (burner.balance !== undefined && burner.balance === 0n && !burner.isE2E);

  let headline: string;
  let detail: string | null = null;
  if (ended) headline = "Voting closed · signal off";
  else if (!active)
    headline =
      flow.kind === "checking" || flow.kind === "loading"
        ? "Restoring the room signal…"
        : (flow.kind === "sign" || flow.kind === "error") && flow.purpose !== "setup"
          ? "Room signal waiting for the organiser"
          : "Room signal not set up";
  else if (beacon.slot === null && beacon.startsIn > 0) {
    headline = on ? "Signal ready" : "Signal set up";
    detail = `Starts ${beacon.startsIn > 90 ? `when voting opens` : `in ${beacon.startsIn} s`}`;
  } else if (beacon.slot === null) headline = "Signal finished";
  else {
    headline = on ? "Signal on" : "Signal paused";
    detail = `slot ${beacon.slot.toLocaleString("en-US")} · ${ago === null ? "not verified yet" : `last verified ${agoText(ago)}`}`;
  }

  return (
    <footer
      aria-label="Room signal"
      className="solid squircle flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3 rounded-xl px-5 py-3 md:px-6"
      data-testid="beacon-status"
    >
      <BeaconQr text={beacon.qrText} />

      <div className="flex min-w-0 flex-1 items-center gap-4">
        <SignalDot on={on && beacon.slot !== null} />
        <div className="min-w-0">
          <p className="text-title-3 text-fg">{headline}</p>
          {detail ? (
            <p className="text-callout text-fg-muted tabular truncate" data-testid="beacon-detail">
              {detail}
            </p>
          ) : null}
        </div>
      </div>

      {on ? <Waveform analyser={transmitter.analyser} on={on} className="hidden h-12 w-56 md:block lg:w-72" /> : null}

      <div className="flex flex-wrap items-center gap-2">
        {beacon.skewWarning ? (
          <Badge tone="warning" icon={<Clock className="size-3.5" strokeWidth={2} aria-hidden />}>
            {`This computer’s clock is ${Math.abs(Math.round(beacon.offset))} s ${beacon.offset > 0 ? "behind" : "ahead"} · following the network`}
          </Badge>
        ) : null}
        {lowFunds && !ended ? (
          <button type="button" onClick={onOpenControls} className="rounded-full">
            <Badge tone="warning" icon={<Wallet className="size-3.5" strokeWidth={2} aria-hidden />}>
              Fund this Stage from Manage
            </Badge>
          </button>
        ) : null}
        {transmitter.status === "error" ? (
          <Badge tone="danger" icon={<AlertTriangle className="size-3.5" strokeWidth={2} aria-hidden />}>
            Sound stopped · QR still works
          </Badge>
        ) : null}
        {burner.advance.status === "error" ? (
          <Badge tone="warning" icon={<AlertTriangle className="size-3.5" strokeWidth={2} aria-hidden />}>
            Couldn&apos;t refresh the signal on the network
          </Badge>
        ) : null}
      </div>
    </footer>
  );
}

function SignalDot({ on }: { on: boolean }) {
  return (
    <span aria-hidden className="relative inline-flex size-3 shrink-0">
      {on ? <span className="animate-live-pulse bg-verified absolute inset-0 rounded-full" /> : null}
      <span className={cn("relative inline-flex size-3 rounded-full", on ? "bg-verified" : "bg-fg-subtle")} />
    </span>
  );
}

/** Small rotating QR with the same payload as the sound (phones offer "Can't hear? Scan the screen"). */
function BeaconQr({ text }: { text: string | null }) {
  const reduce = useReducedMotionPref();
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          "squircle relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-md p-1.5 md:size-24",
          text ? "bg-fg text-bg" : "border-border-strong border border-dashed",
        )}
        data-testid="beacon-qr"
        aria-label={text ? "Room signal code" : undefined}
        role={text ? "img" : undefined}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {text ? (
            <motion.div
              key={text}
              className="size-full"
              initial={{ opacity: 0, scale: reduce ? 1 : 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={fade}
            >
              <QRCodeSVG value={text} level="L" marginSize={0} bgColor="transparent" fgColor="currentColor" className="block size-full" />
            </motion.div>
          ) : (
            <span key="none" className="size-full" />
          )}
        </AnimatePresence>
      </div>
      <p className="text-footnote text-fg-muted hidden w-24 xl:block">Can&apos;t hear it? Scan here.</p>
    </div>
  );
}

/** Live output waveform from the transmitter's AnalyserNode (a flat line when off). Canvas, rAF while visible. */
function Waveform({ analyser, on, className }: { analyser: AnalyserNode | null; on: boolean; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotionPref();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const color = getComputedStyle(canvas).color;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
    };
    resize();
    const data = analyser ? new Uint8Array(analyser.fftSize) : null;
    let raf = 0;
    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5 * dpr;
      ctx.lineJoin = "round";
      ctx.beginPath();
      if (analyser && data && on) {
        analyser.getByteTimeDomainData(data);
        // Ultrasound is near Nyquist, so draw the envelope (peak per column) rather than raw samples.
        const cols = Math.floor(w / (3 * dpr));
        const per = Math.max(1, Math.floor(data.length / cols));
        for (let c = 0; c < cols; c++) {
          let peak = 0;
          for (let i = c * per; i < (c + 1) * per && i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128));
          const amp = Math.min(1, (peak / 128) * 2.2) * (h / 2 - 2 * dpr);
          const x = (c / (cols - 1)) * w;
          ctx.moveTo(x, h / 2 - amp);
          ctx.lineTo(x, h / 2 + amp);
        }
      } else {
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
      }
      ctx.stroke();
      if (!reduce && on && analyser) raf = requestAnimationFrame(draw);
    };
    draw();
    const timer = reduce && on ? setInterval(draw, 500) : undefined;
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
      window.removeEventListener("resize", resize);
    };
  }, [analyser, on, reduce]);

  return <canvas ref={ref} aria-hidden className={cn("text-accent", className)} />;
}
