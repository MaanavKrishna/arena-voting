"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Download, KeyRound, RotateCw, ShieldAlert, Upload } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { shortAddress } from "@/components/ui/AddressChip";
import { useReducedMotionPref } from "@/components/ui/hooks";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { TxButton } from "@/components/wallet/TxButton";
import { useArena } from "@/hooks/useArena";
import { useArenaWrite } from "@/hooks/useArenaWrite";
import { arenaKeys } from "@/hooks/shared";
import { SLOT_SECONDS } from "@/lib/beacon/chain";
import { spring } from "@/lib/motion";
import type { BeaconController, PendingBeacon } from "./useBeaconController";

/**
 * The organiser-facing set-up / recovery card (docs/ground-presence.md table). Floats over the
 * stage. Every on-chain step is an explicit button; nothing here publishes on its own.
 */
export function BeaconSetup({ controller, contestId }: { controller: BeaconController; contestId: bigint }) {
  const reduce = useReducedMotionPref();
  const { flow } = controller;
  return (
    <div className="bg-scrim/70 fixed inset-0 z-30 grid place-items-center overflow-y-auto p-4 md:p-6" data-testid="beacon-setup">
      <motion.div
        key={flow.kind}
        role="dialog"
        aria-modal="true"
        aria-labelledby="beacon-setup-title"
        initial={{ opacity: 0, scale: reduce ? 1 : 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={spring.smooth}
        className="glass-thick squircle flex w-full max-w-lg flex-col gap-6 rounded-xl p-6 md:p-8"
      >
        <Body controller={controller} contestId={contestId} />
      </motion.div>
    </div>
  );
}

function Header({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="bg-accent/14 text-accent grid size-12 place-items-center rounded-full">{icon}</span>
      <h2 id="beacon-setup-title" className="text-title-1 text-fg">
        {title}
      </h2>
      {children ? <div className="text-body text-fg-muted flex flex-col gap-2">{children}</div> : null}
    </div>
  );
}

function Body({ controller, contestId }: { controller: BeaconController; contestId: bigint }) {
  const { flow } = controller;
  switch (flow.kind) {
    case "sign":
    case "error": {
      const copy = {
        setup: {
          title: "Set up the room signal",
          text: "Your wallet confirms a short message, with no fee. That creates the secret this Stage broadcasts, so phones can prove they're in the room.",
        },
        recover: {
          title: "Restore the room signal",
          text: "The signal is already set up, but this computer doesn't hold its secret. Confirm the same message in the organiser's wallet to rebuild it. No fee, nothing changes on the network.",
        },
        rotate: {
          title: "Rotate the room signal",
          text: "Makes a new secret and replaces the old one. Codes already heard stop working. This needs a network fee.",
        },
      }[flow.purpose];
      return (
        <>
          <Header icon={<KeyRound className="size-6" strokeWidth={1.5} aria-hidden />} title={copy.title}>
            <p>{copy.text}</p>
            <p className="text-footnote">You&apos;ll be asked twice: the second time checks your wallet gives the same answer every time.</p>
          </Header>
          <WalletGate controller={controller}>
            <div className="flex flex-col gap-2">
              <Button size="lg" className="w-full rounded-full" onClick={() => void controller.sign()}>
                {flow.kind === "error" ? "Try again" : "Continue in wallet"}
              </Button>
              {flow.kind === "error" ? <p className="text-footnote text-danger-text text-center">{flow.message}</p> : null}
            </div>
          </WalletGate>
          {flow.purpose === "recover" ? <RestoreFromFile controller={controller} /> : null}
          {flow.purpose === "rotate" ? (
            <Button variant="ghost" className="self-center" onClick={controller.cancel}>
              Keep the current signal
            </Button>
          ) : null}
        </>
      );
    }
    case "signing":
      return (
        <Header icon={<Spinner />} title="Confirm in your wallet">
          <p>
            {flow.step === 1 ? "Step 1 of 2." : "Step 2 of 2: one more time, to check your wallet gives the same answer."} No fee.
          </p>
        </Header>
      );
    case "building":
      return (
        <Header icon={<Spinner />} title="Building the signal…">
          <p>One code for every 10 seconds of voting. This takes a moment for long contests.</p>
        </Header>
      );
    case "backup-required":
      return (
        <>
          <Header icon={<ShieldAlert className="size-6" strokeWidth={1.5} aria-hidden />} title="Download your beacon backup">
            <p>
              Your wallet gives a different answer each time, so it can&apos;t rebuild this signal later. If this computer
              restarts, the backup file is the only way back.
            </p>
            <p className="text-footnote">Keep it private: anyone with it can fake being in the room.</p>
          </Header>
          <Button size="lg" className="w-full rounded-full" icon={<Download className="size-5" strokeWidth={1.75} aria-hidden />} onClick={controller.downloadBackup}>
            Download backup
          </Button>
        </>
      );
    case "publish":
      return <Publish controller={controller} pending={flow.pending} contestId={contestId} />;
    case "mismatch":
      return (
        <>
          <Header icon={<ShieldAlert className="size-6" strokeWidth={1.5} aria-hidden />} title="This doesn't match the signal on the network">
            <p>
              {flow.reason === "wrong-wallet"
                ? "That wallet rebuilt a different signal. Use the wallet that set it up, or a backup file."
                : flow.reason === "smart-wallet"
                  ? "This wallet gives a different answer each time, so it can't rebuild the signal. Use the backup file you downloaded."
                  : "That backup belongs to another signal."}
            </p>
            <p className="text-footnote">Nothing has changed on the network. Rotating makes a new signal and needs a network fee.</p>
          </Header>
          <RestoreFromFile controller={controller} />
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={controller.cancel}>
              Try another wallet
            </Button>
            <Button variant="ghost" icon={<RotateCw className="size-4" strokeWidth={1.75} aria-hidden />} onClick={controller.startRotate}>
              Rotate beacon
            </Button>
          </div>
        </>
      );
    default:
      return null;
  }
}

/** Signing needs the organiser's own wallet. */
function WalletGate({ controller, children }: { controller: BeaconController; children: ReactNode }) {
  const { isOrganiser, organiser } = controller;
  if (isOrganiser) return <>{children}</>;
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-callout text-fg-muted">
        Connect the organiser&apos;s wallet{organiser ? ` (${shortAddress(organiser)})` : ""} to continue.
      </p>
      <ConnectButton />
    </div>
  );
}

function Publish({ controller, pending, contestId }: { controller: BeaconController; pending: PendingBeacon; contestId: bigint }) {
  const write = useArenaWrite("setBeacon");
  const queryClient = useQueryClient();
  const { chainId } = useArena();
  const hours = (pending.length * SLOT_SECONDS) / 3600;
  const status = write.status;

  useEffect(() => {
    if (status === "confirmed") void queryClient.invalidateQueries({ queryKey: arenaKeys.contest(chainId, contestId) });
  }, [status, queryClient, chainId, contestId]);

  return (
    <>
      <Header icon={<KeyRound className="size-6" strokeWidth={1.5} aria-hidden />} title={pending.purpose === "rotate" ? "Save the new signal" : "Save the signal on the network"}>
        <p>
          Publishes the signal&apos;s public check value so the contract can verify phones. Covers{" "}
          {hours >= 1 ? `${hours.toFixed(1)} hours` : `${Math.round(hours * 60)} minutes`} of voting. Needs a network fee.
        </p>
      </Header>
      <TxButton
        action={write}
        size="lg"
        fullWidth
        className="[&_button]:rounded-full"
        confirmedLabel="Saved"
        onClick={() => void write.write({ args: [contestId, pending.anchor, pending.start, pending.length] })}
      >
        {pending.purpose === "rotate" ? "Rotate beacon" : "Save signal"}
      </TxButton>
      <div className="flex flex-wrap justify-center gap-2">
        {pending.deterministic ? (
          <Button variant="ghost" size="sm" icon={<Download className="size-4" strokeWidth={1.75} aria-hidden />} onClick={controller.downloadBackup}>
            Download backup (optional)
          </Button>
        ) : null}
        {pending.purpose === "rotate" ? (
          <Button variant="ghost" size="sm" onClick={controller.cancel} disabled={write.isBusy}>
            Cancel
          </Button>
        ) : null}
      </div>
    </>
  );
}

/** "Use a backup file": reads arena-beacon-<id>.json and rebuilds from it. */
export function RestoreFromFile({ controller, className }: { controller: BeaconController; className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={className ?? "flex flex-col items-center gap-1"}>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setError(await controller.restoreBackup(await file.text()));
        }}
      />
      <Button variant="ghost" size="sm" icon={<Upload className="size-4" strokeWidth={1.75} aria-hidden />} onClick={() => input.current?.click()}>
        Use a backup file
      </Button>
      {error ? <p className="text-footnote text-danger-text text-center">{error}</p> : null}
    </div>
  );
}
