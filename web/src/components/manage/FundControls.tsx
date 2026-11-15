"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { currencyLabel } from "@/config/network";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { TxButton } from "@/components/wallet/TxButton";
import { formatEth } from "@/lib/format";
import { checkFunding } from "./funding";
import { useFundTransfer } from "./useFundTransfer";

/**
 * "Send some test money to this address": an amount, quick presets, and a TxButton that makes a
 * plain value transfer from the connected wallet.
 */
export function FundControls({
  address,
  presets,
  defaultAmount,
  label = "Send",
  recipientName,
  onSent,
}: {
  /** Address to fund, as typed (may be invalid; the button explains). */
  address: string;
  presets: string[];
  defaultAmount: string;
  label?: string;
  recipientName: string;
  onSent?: () => void;
}) {
  const [amount, setAmount] = useState(defaultAmount);
  const fund = useFundTransfer();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const check = checkFunding(address, amount);

  const send = async () => {
    if (!check.ok) return;
    const hash = await fund.send(check.to, check.value);
    if (hash) {
      toast({ tone: "success", title: `Sent ${formatEth(check.value)} ${currencyLabel} to the ${recipientName}.` });
      await queryClient.invalidateQueries({ queryKey: ["balance"] });
      setTimeout(fund.reset, 2500);
      onSent?.();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Field label="Amount">
        <Input
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            if (fund.status !== "idle") fund.reset();
          }}
          inputMode="decimal"
          autoComplete="off"
          trailing={currencyLabel}
          className="tabular"
          disabled={fund.isBusy}
        />
      </Field>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick amounts">
        {presets.map((p) => (
          <Button
            key={p}
            size="sm"
            variant="secondary"
            pressed={amount.trim() === p}
            onClick={() => setAmount(p)}
            disabled={fund.isBusy}
          >
            {p}
          </Button>
        ))}
      </div>
      <TxButton
        action={fund}
        onClick={() => void send()}
        disabledReason={check.ok ? null : check.reason}
        confirmedLabel="Sent"
        fullWidth
      >
        {label}
      </TxButton>
    </div>
  );
}
