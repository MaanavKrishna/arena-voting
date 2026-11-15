"use client";

import { DoorOpen, ScanLine } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getAddress, isAddress, type Address } from "viem";
import { currencyLabel, explorerAddressUrl } from "@/config/network";
import { AddressChip } from "@/components/ui/AddressChip";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { TxButton } from "@/components/wallet/TxButton";
import { useArena } from "@/hooks/useArena";
import { useArenaWrite } from "@/hooks/useArenaWrite";
import { formatEth } from "@/lib/format";
import { AddressBalance, useAddressBalance } from "./AddressBalance";
import { AddressScanner } from "./AddressScanner";
import { ControlCard, Note } from "./ControlCard";
import { FundControls } from "./FundControls";
import { checkInsLeft } from "./funding";
import type { GatekeeperSet } from "./gatekeepers";

const LOW_CHECK_INS = 10;
const GATE_PRESETS = ["0.05", "0.1", "0.25"];

function useRefreshGates() {
  const queryClient = useQueryClient();
  const { chainId } = useArena();
  return () => queryClient.invalidateQueries({ queryKey: ["arena", chainId, "logs", "GatekeeperSet"] });
}

function GateRow({
  contestId,
  address,
  drip,
  onFund,
}: {
  contestId: bigint;
  address: Address;
  drip: bigint;
  onFund: (address: Address) => void;
}) {
  const revoke = useArenaWrite("setGatekeeper");
  const refresh = useRefreshGates();
  const { toast } = useToast();
  const { data } = useAddressBalance(address);
  const left = data ? checkInsLeft(data.value, drip) : null;
  const low = data ? (left !== null ? left < LOW_CHECK_INS : data.value === 0n) : false;

  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        <AddressChip address={address} explorerUrl={explorerAddressUrl(address) ?? undefined} />
        <div className="text-footnote text-fg-muted flex flex-wrap items-center gap-x-2 gap-y-1">
          {data ? (
            <>
              <span className="tabular">
                {formatEth(data.value)} {currencyLabel}
              </span>
              {left !== null ? <span>· about {left} check-ins</span> : null}
              {low ? <Badge tone="warning">Running low</Badge> : null}
            </>
          ) : (
            <Skeleton className="h-4 w-24" />
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => onFund(address)}>
          Fund gate
        </Button>
        <TxButton
          size="sm"
          variant="ghost"
          action={revoke}
          confirmedLabel="Revoked"
          onClick={async () => {
            const hash = await revoke.write({ args: [contestId, address, false] });
            if (hash) {
              await refresh();
              toast({ tone: "success", title: "Gate revoked. It can no longer check people in." });
            }
          }}
        >
          Revoke
        </TxButton>
      </div>
    </li>
  );
}

export function GatekeepersCard({
  contestId,
  gates,
  isLoading,
  dripPerCheckIn,
  votingEnded,
}: {
  contestId: bigint;
  gates: GatekeeperSet;
  isLoading: boolean;
  dripPerCheckIn: bigint;
  votingEnded: boolean;
}) {
  const authorise = useArenaWrite("setGatekeeper");
  const refresh = useRefreshGates();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [scanning, setScanning] = useState(false);
  const [funding, setFunding] = useState<Address | null>(null);

  const trimmed = text.trim();
  const valid = isAddress(trimmed, { strict: false });
  const normalised = valid ? getAddress(trimmed) : null;
  const already = normalised ? gates.active.includes(normalised) : false;
  const reason =
    trimmed === ""
      ? "Paste or scan the gate's address."
      : !valid
        ? "That doesn't look like a wallet address."
        : already
          ? "That gate is already authorised."
          : votingEnded
            ? "Voting has ended."
            : null;

  return (
    <ControlCard
      id="gates"
      icon={<DoorOpen strokeWidth={1.75} />}
      title="Gates"
      description="Door devices that may check people in. Open the Gate page on the device, then add its address here."
      span={2}
    >
      <div className="flex flex-col gap-3">
        <Field
          label="Gate address"
          helper="Shown on the Gate page. You can paste it or scan its QR code."
          error={trimmed !== "" && !valid ? "That doesn't look like a wallet address." : undefined}
        >
          <Input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (authorise.status !== "idle") authorise.reset();
            }}
            placeholder="0x…"
            spellCheck={false}
            autoComplete="off"
            className="font-mono text-footnote"
          />
        </Field>
        <div className="flex flex-wrap items-start gap-2">
          <TxButton
            action={authorise}
            disabledReason={reason}
            confirmedLabel="Gate authorised"
            onClick={async () => {
              if (!normalised) return;
              const hash = await authorise.write({ args: [contestId, normalised, true] });
              if (hash) {
                setText("");
                setTimeout(authorise.reset, 2500);
                await refresh();
                toast({ tone: "success", title: "Gate authorised. Send it a little test money so it can pay fees." });
              }
            }}
          >
            Authorise this gate
          </TxButton>
          <Button
            variant="secondary"
            icon={<ScanLine className="size-4" strokeWidth={1.75} aria-hidden />}
            onClick={() => setScanning(true)}
          >
            Scan code
          </Button>
        </div>
      </div>

      <div className="border-border border-t pt-5">
        {isLoading ? (
          <div role="status" aria-label="Loading gates" className="flex flex-col gap-3">
            <Skeleton className="h-10 w-full" />
          </div>
        ) : gates.active.length === 0 ? (
          <Note>No gates yet. Once you authorise one, it appears here with its balance.</Note>
        ) : (
          <ul className="divide-border divide-y">
            {gates.active.map((a) => (
              <GateRow key={a} contestId={contestId} address={a} drip={dripPerCheckIn} onFund={setFunding} />
            ))}
          </ul>
        )}
        {gates.revoked.length > 0 ? (
          <p className="text-footnote text-fg-muted mt-4">
            {gates.revoked.length} revoked gate{gates.revoked.length === 1 ? "" : "s"} can no longer check anyone in.
          </p>
        ) : null}
      </div>

      <AddressScanner open={scanning} onOpenChange={setScanning} onAddress={(a) => setText(a)} />
      <Sheet
        open={funding !== null}
        onOpenChange={(o) => !o && setFunding(null)}
        title="Fund this gate"
        description="The gate pays network fees for each check-in and hands each guest a little to get started."
      >
        {funding ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <AddressChip address={funding} />
              <AddressBalance address={funding} className="text-footnote text-fg-muted tabular" />
            </div>
            <FundControls
              address={funding}
              presets={GATE_PRESETS}
              defaultAmount={GATE_PRESETS[0]}
              recipientName="gate"
              label="Send to the gate"
              onSent={() => setFunding(null)}
            />
          </div>
        ) : null}
      </Sheet>
    </ControlCard>
  );
}
