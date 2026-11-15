"use client";

import { Radio } from "lucide-react";
import { useState } from "react";
import { currencyLabel } from "@/config/network";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { AddressBalance } from "./AddressBalance";
import { ControlCard } from "./ControlCard";
import { FundControls } from "./FundControls";

const STAGE_PRESETS = ["0.02", "0.05", "0.1"];

/** Sends fee money to the Stage's own wallet so it can keep the room signal verified on-chain. */
export function FundStageCard({ span }: { span: 1 | 3 }) {
  const [address, setAddress] = useState("");
  return (
    <ControlCard
      id="stage-fund"
      icon={<Radio strokeWidth={1.75} />}
      title="Fund the stage"
      description={`The Stage page keeps its own small wallet to refresh the room signal. About 0.02 ${currencyLabel} covers a whole event.`}
      span={span}
    >
      <div className={span === 3 ? "grid gap-5 md:grid-cols-2 md:gap-8" : "flex flex-col gap-4"}>
        <Field label="Stage wallet address" helper="Copy it from the Stage page.">
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x…"
            spellCheck={false}
            autoComplete="off"
            className="font-mono text-footnote"
          />
          {address.trim() !== "" ? (
            <AddressBalance address={address.trim()} className="text-footnote text-fg-muted tabular mt-1.5 block" />
          ) : null}
        </Field>
        <FundControls
          address={address}
          presets={STAGE_PRESETS}
          defaultAmount={STAGE_PRESETS[0]}
          recipientName="stage"
          label="Fund the stage"
        />
      </div>
    </ControlCard>
  );
}
