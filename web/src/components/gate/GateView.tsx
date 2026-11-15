"use client";

import { ArrowLeft, DoorClosed, Expand, Fuel, Shrink, TriangleAlert, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useBalance, useGasPrice } from "wagmi";
import { AddressChip } from "@/components/ui/AddressChip";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useIsClient } from "@/components/ui/hooks";
import { QRScanner, type ScannerStatus } from "@/components/presence/QRScanner";
import { currencyLabel, isE2E } from "@/config/network";
import { arenaAbi } from "@/generated";
import { useArena } from "@/hooks/useArena";
import { useContest } from "@/hooks/useContest";
import { useGate, checkInsLeft, CHECK_IN_GAS, LOW_CHECK_INS, type Verdict } from "@/hooks/useGate";
import { useTicketList } from "@/hooks/useTicketList";
import { arenaKeys, parseContestId } from "@/hooks/shared";
import { burnerWalletClient, getOrCreateBurner, type Burner } from "@/lib/burner";
import { cn } from "@/lib/cn";
import { formatEth } from "@/lib/format";
import { CheckInQueue } from "./CheckInQueue";
import { GateFlash } from "./GateFlash";
import { GateSetup } from "./GateSetup";
import { haptic, useGateSound } from "./gateSound";

declare global {
  interface Window {
    /** E2E only (`isE2E`): feed the Gate a scanned string, as if the camera read it. */
    __arenaGateScan?: (text: string) => Promise<void>;
  }
}

const AUTH_POLL_MS = 3_000;

export function GateView({ contestId }: { contestId: string }) {
  const id = parseContestId(contestId);
  const isClient = useIsClient();
  const { chainId, address: arena, client, deployed } = useArena();
  const contest = useContest(contestId);
  const tickets = useTicketList(contestId);

  // The Gate's own key: created once per device and contest, kept in localStorage (browser-only,
  // so it's read after mount).
  const [burnerFor, setBurner] = useState<{ key: string; burner: Burner } | null>(null);
  const burnerKey = isClient && id !== undefined ? `${chainId}:${id}` : null;
  useEffect(() => {
    if (!isClient || id === undefined) return;
    let live = true;
    const k = `${chainId}:${id}`;
    void getOrCreateBurner("gate", chainId, id).then((b) => {
      if (live) setBurner({ key: k, burner: b });
    });
    return () => {
      live = false;
    };
  }, [isClient, chainId, id]);
  const burner = burnerFor && burnerFor.key === burnerKey ? burnerFor.burner : null;
  const gateAddress = burner?.account.address;
  const walletClient = useMemo(() => (burner ? burnerWalletClient(burner.account) : null), [burner]);

  const auth = useQuery({
    queryKey: [...arenaKeys.contest(chainId, id ?? 0n), "gatekeeper", gateAddress ?? ""],
    enabled: !!client && !!arena && id !== undefined && !!gateAddress,
    refetchInterval: (q) => (q.state.data ? 30_000 : AUTH_POLL_MS),
    queryFn: () =>
      client!.readContract({
        address: arena!,
        abi: arenaAbi,
        functionName: "isGatekeeper",
        args: [id!, gateAddress!],
      }),
  });

  const balance = useBalance({
    address: gateAddress,
    chainId,
    query: { enabled: !!gateAddress, refetchInterval: 6_000 },
  });
  const gasPrice = useGasPrice({ chainId, query: { refetchInterval: 20_000 } });
  const drip = contest.data?.dripPerCheckIn ?? 0n;
  const perCheckIn = gasPrice.data !== undefined ? drip + CHECK_IN_GAS * gasPrice.data : undefined;
  const left = checkInsLeft(balance.data?.value, drip, gasPrice.data);

  const { unlock, play, muted, setMuted } = useGateSound();
  const [camera, setCamera] = useState<ScannerStatus>("idle");
  const onResult = useCallback(
    (v: Verdict) => {
      play(v.ok ? "ok" : "no");
      haptic(v.ok ? 10 : [30, 40, 30]);
    },
    [play],
  );

  const gated = contest.data?.presence === 2;
  const open = contest.phase !== "ended" && contest.phase !== "finalized";
  const authorised = auth.data === true;
  const enabled = !!burner && gated && open && authorised;

  const gate = useGate({
    enabled,
    contestId: id ?? 0n,
    chainId,
    arena,
    drip,
    publicClient: client,
    walletClient,
    burner,
    ticketList: { hasList: tickets.hasList, ready: !!tickets.tree, proofFor: tickets.proofFor },
    onResult,
  });

  // E2E: no camera in headless browsers, so tests hand the Gate the decoded text directly.
  const { onScan } = gate;
  useEffect(() => {
    if (!isE2E) return;
    window.__arenaGateScan = onScan;
    return () => {
      delete window.__arenaGateScan;
    };
  }, [onScan]);

  // Refresh the balance as check-ins confirm.
  const refetchBalance = balance.refetch;
  useEffect(() => {
    if (gate.counts.confirmed > 0) void refetchBalance();
  }, [gate.counts.confirmed, refetchBalance]);

  let main: React.ReactNode;
  if (!deployed) {
    main = <ErrorState title="Arena isn't available on this network." description="Check the app's network settings." />;
  } else if (id === undefined || (contest.isError && !contest.data)) {
    main = (
      <ErrorState
        title="We couldn't find that contest."
        description="Check the link, or open the gate from the contest's Manage page."
        onRetry={id === undefined ? undefined : () => void contest.refetch()}
      />
    );
  } else if (!contest.data || !burner || auth.isPending) {
    main = <GateSkeleton />;
  } else if (!gated) {
    main = (
      <EmptyState
        icon={<DoorClosed strokeWidth={1.75} />}
        title="This contest doesn't use door check-in"
        description="Only Gated contests have a door. Voters here don't need to check in."
        action={<BackLink contestId={contestId} label="Back to contest" />}
      />
    );
  } else if (!open) {
    main = (
      <EmptyState
        icon={<DoorClosed strokeWidth={1.75} />}
        title="Check-in has closed"
        description="Voting has ended for this contest, so the door is closed."
        action={<BackLink contestId={contestId} label="Back to contest" />}
      />
    );
  } else if (!authorised) {
    main = <GateSetup address={burner.account.address} balance={balance.data?.value} perCheckIn={perCheckIn} />;
  } else {
    const flash = gate.state.flash;
    const statusLine = gate.state.verifying
      ? "Checking pass…"
      : flash
        ? flash.kind === "accepted"
          ? "Checked in"
          : "Not admitted"
        : camera === "live"
          ? "Ready — hold your pass up to the camera"
          : "Turn on the camera to start checking people in";
    main = (
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6">
        <section aria-label="Scanner" className="flex min-h-0 flex-col gap-3">
          <QRScanner
            onScan={(t) => void gate.onScan(t)}
            paused={!gate.ready}
            onStatusChange={setCamera}
            explainer="The gate reads each guest's live pass with this device's camera. Nothing is recorded or uploaded."
            className="squircle aspect-square w-full rounded-xl sm:aspect-4/3 lg:aspect-auto lg:min-h-0 lg:flex-1"
            overlay={<Reticle busy={gate.state.verifying} />}
          />
          <p
            className={cn(
              "text-title-3 text-center transition-colors",
              gate.state.verifying ? "text-fg-muted" : "text-fg",
            )}
            role="status"
            aria-live="polite"
            data-gate-ready={gate.ready || undefined}
          >
            {statusLine}
          </p>
        </section>
        <CheckInQueue
          items={gate.state.queue}
          counts={gate.counts}
          onRetry={gate.retry}
          className="max-h-[50dvh] lg:max-h-none"
        />
      </div>
    );
  }

  const live = enabled;

  return (
    <div
      className="pb-safe flex min-h-dvh flex-1 flex-col gap-4 px-4 pt-4 md:px-6 lg:h-dvh"
      onPointerDown={unlock}
      onKeyDown={unlock}
    >
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Link
          href={`/c/${contestId}`}
          className="text-fg-muted hover:text-fg hover:bg-fg/6 -ml-2 grid size-10 place-items-center rounded-full transition-colors"
          aria-label="Leave the gate"
        >
          <ArrowLeft className="size-5" strokeWidth={1.75} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-caption-caps text-fg-muted">Door check-in</p>
          {contest.data ? (
            <h1 className="text-title-2 text-fg truncate">{contest.data.title}</h1>
          ) : (
            <Skeleton className="mt-1 h-6 w-48" />
          )}
        </div>
        {live ? (
          <GateFunds
            balance={balance.data?.value}
            left={left}
            className="order-last w-full sm:order-none sm:w-auto"
          />
        ) : null}
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="size-10 rounded-full px-0"
            onClick={() => setMuted(!muted)}
            aria-label={muted ? "Turn sound on" : "Turn sound off"}
            pressed={muted}
          >
            {muted ? <VolumeX className="size-5" strokeWidth={1.75} /> : <Volume2 className="size-5" strokeWidth={1.75} />}
          </Button>
          <FullscreenButton />
        </div>
      </header>

      {live && gate.burst ? (
        <div role="alert" className="solid squircle flex items-center gap-3 rounded-md px-4 py-3">
          <span aria-hidden className="bg-warning/18 text-warning-text grid size-8 shrink-0 place-items-center rounded-full">
            <TriangleAlert className="size-4" strokeWidth={1.75} />
          </span>
          <p className="text-callout text-fg">
            {gate.burstCount} check-ins in the last minute. That&rsquo;s unusually fast — make sure each person is
            actually here.
          </p>
        </div>
      ) : null}

      {live && left !== null && left < LOW_CHECK_INS ? (
        <div role="alert" className="solid squircle flex items-center gap-3 rounded-md px-4 py-3">
          <span aria-hidden className="bg-warning/18 text-warning-text grid size-8 shrink-0 place-items-center rounded-full">
            <Fuel className="size-4" strokeWidth={1.75} />
          </span>
          <p className="text-callout text-fg min-w-0 flex-1">
            {left === 0 ? "This gate is out of funds" : `Only about ${left} check-ins left`}
            <span className="text-fg-muted"> — ask the organiser to fund it from Manage → Door devices.</span>
          </p>
          {gateAddress ? <AddressChip address={gateAddress} className="hidden shrink-0 md:inline-flex" /> : null}
        </div>
      ) : null}

      {live && tickets.isError ? (
        <div role="alert" className="solid squircle flex items-center gap-3 rounded-md px-4 py-3">
          <span aria-hidden className="bg-danger/12 text-danger-text grid size-8 shrink-0 place-items-center rounded-full">
            <TriangleAlert className="size-4" strokeWidth={1.75} />
          </span>
          <p className="text-callout text-fg">
            The guest list couldn&rsquo;t be loaded, so passes can&rsquo;t be checked against it. Reload to try again.
          </p>
        </div>
      ) : null}

      <main className="flex min-h-0 flex-1 flex-col justify-center">{main}</main>
      <GateFlash flash={gate.state.flash} />
    </div>
  );
}

function GateFunds({
  balance,
  left,
  className,
}: {
  balance: bigint | undefined;
  left: number | null;
  className?: string;
}) {
  if (balance === undefined) return <Skeleton className={cn("h-6 w-40 rounded-full", className)} />;
  const low = left !== null && left < LOW_CHECK_INS;
  return (
    <div className={cn("flex items-center gap-2", className)} aria-live="polite">
      <span className="text-footnote text-fg-muted tabular">
        {formatEth(balance)} {currencyLabel}
      </span>
      <Badge tone={low ? "warning" : "neutral"}>
        <Fuel aria-hidden strokeWidth={1.75} />
        <span className="tabular">{left === null ? "Checking…" : `≈ ${left.toLocaleString()} check-ins left`}</span>
      </Badge>
      {low ? <span className="sr-only">Running low: ask the organiser to fund this gate.</span> : null}
    </div>
  );
}

/** Corner brackets over the camera, with a soft pulse while a pass is being checked. */
function Reticle({ busy }: { busy: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
      <div className="relative aspect-square w-3/5 max-w-96">
        {(["top-0 left-0 border-t-4 border-l-4 rounded-tl-lg", "top-0 right-0 border-t-4 border-r-4 rounded-tr-lg", "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-lg", "bottom-0 right-0 border-b-4 border-r-4 rounded-br-lg"] as const).map(
          (pos) => (
            <span
              key={pos}
              className={cn(
                "border-fg/90 absolute size-12 transition-opacity duration-200",
                pos,
                busy && "animate-pulse",
              )}
            />
          ),
        )}
      </div>
    </div>
  );
}

function BackLink({ contestId, label }: { contestId: string; label: string }) {
  return (
    <Link
      href={`/c/${contestId}`}
      className="text-callout bg-fg/6 hover:bg-fg/10 text-fg inline-flex h-10 items-center rounded-sm px-4 transition-colors"
    >
      {label}
    </Link>
  );
}

function FullscreenButton() {
  const isClient = useIsClient();
  const [full, setFull] = useState(false);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const supported = isClient && !!document.documentElement.requestFullscreen;
  if (!supported) return null;
  return (
    <Button
      size="sm"
      variant="ghost"
      className="hidden size-10 rounded-full px-0 sm:inline-flex"
      aria-label={full ? "Exit full screen" : "Full screen"}
      onClick={() =>
        void (full ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})
      }
    >
      {full ? <Shrink className="size-5" strokeWidth={1.75} /> : <Expand className="size-5" strokeWidth={1.75} />}
    </Button>
  );
}

function GateSkeleton() {
  return (
    <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6" aria-busy>
      <Skeleton className="aspect-square w-full rounded-xl sm:aspect-4/3 lg:aspect-auto lg:h-full" />
      <Skeleton className="h-64 w-full rounded-lg lg:h-full" />
    </div>
  );
}
