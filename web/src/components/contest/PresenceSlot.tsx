"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BeaconQRScanner } from "@/components/presence/BeaconQRScanner";
import { GetPassPanel } from "@/components/presence/GetPassPanel";
import { PresenceChip } from "@/components/presence/PresenceChip";
import { Sheet } from "@/components/ui/Sheet";
import { useIsClient } from "@/components/ui/hooks";
import type { Presence } from "@/hooks/usePresence";
import { cn } from "@/lib/cn";
import { PRESENCE_GATED, PRESENCE_ROOM } from "./contestLogic";

type PresenceContextValue = {
  presence: Presence;
  /** Gated: the wallet's door check-in has landed. */
  checkedIn: boolean;
  openScanner: () => void;
};

const PresenceContext = createContext<PresenceContextValue | null>(null);

/**
 * One presence session per contest page: the page and the entry sheet both show the same chip,
 * so they share this state (one mic, one token) instead of each listening on their own.
 * Also owns the "Scan the screen" camera sheet.
 */
export function PresenceProvider({
  presence,
  checkedIn,
  children,
}: {
  presence: Presence;
  checkedIn: boolean;
  children: ReactNode;
}) {
  const [scanning, setScanning] = useState(false);
  const openScanner = useCallback(() => setScanning(true), []);
  const value = useMemo(() => ({ presence, checkedIn, openScanner }), [presence, checkedIn, openScanner]);
  const scanQR = presence.scanQR;

  return (
    <PresenceContext.Provider value={value}>
      {children}
      <Sheet
        open={scanning}
        onOpenChange={setScanning}
        title="Scan the screen"
        description="The small code under the results changes every 10 seconds."
      >
        {scanning ? (
          <BeaconQRScanner
            onBeacon={(text) => {
              const ok = scanQR(text);
              if (ok) setTimeout(() => setScanning(false), 600);
              return ok;
            }}
          />
        ) : null}
      </Sheet>
    </PresenceContext.Provider>
  );
}

export type PresenceSlotProps = {
  contestId: bigint;
  /** 1 = Room, 2 = Gated. */
  presence: number;
  /** `floating`: pinned to the bottom of the page. `inline`: in flow (the entry sheet). */
  placement?: "floating" | "inline";
  className?: string;
};

/**
 * Where a Room/Gated voter proves presence. Room → the presence chip. Gated → the door pass until
 * the check-in lands, then the presence chip (Gated needs both). In the entry sheet a Gated voter
 * who hasn't checked in sees nothing here; the vote button already says why.
 */
export function PresenceSlot({ contestId, presence: mode, placement = "inline", className }: PresenceSlotProps) {
  const ctx = useContext(PresenceContext);
  const client = useIsClient();
  if (!ctx || (mode !== PRESENCE_ROOM && mode !== PRESENCE_GATED)) return null;
  const { presence, checkedIn, openScanner } = ctx;

  if (mode === PRESENCE_GATED && !checkedIn) {
    return placement === "inline" ? null : <GetPassPanel contestId={contestId} className={className} />;
  }

  const chip = (chipClass?: string) => (
    <PresenceChip
      status={presence.state}
      micOn={presence.mic === "on"}
      micProblem={presence.micProblem}
      ageMs={presence.ageMs}
      inRoom={presence.inRoom}
      rejected={presence.rejected}
      pulse={presence.pulse}
      onListen={presence.listen}
      onScan={openScanner}
      className={chipClass}
    />
  );

  if (placement === "inline") {
    return (
      <div data-slot="presence" data-contest={contestId.toString()}>
        {chip(className)}
      </div>
    );
  }

  // Phone: pinned to the bottom, in thumb reach. Desktop: in the page's action area, beside the
  // gallery (a pinned chip would sit over the results column).
  return (
    <>
      <div data-slot="presence" data-contest={contestId.toString()} className={cn("hidden lg:block", className)}>
        {chip()}
      </div>
      {client
        ? createPortal(
            <div
              data-slot="presence"
              data-contest={contestId.toString()}
              className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:hidden"
            >
              {chip("pointer-events-auto w-full max-w-md shadow-lg")}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
