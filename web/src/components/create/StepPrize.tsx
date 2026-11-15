"use client";

import { Pencil } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { currencyLabel, isTestnet } from "@/config/network";
import { formatEth } from "@/lib/format";
import { parseTicketList } from "@/lib/tickets";
import { dripFor, parseEthInput, prizeFor, type StepProps } from "./draft";
import { localInputToUnix } from "@/components/ui/DateTimeField";

const dateFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});
const when = (v: string) => {
  const t = localInputToUnix(v);
  return t === null ? "Not set" : dateFmt.format(new Date(t * 1000));
};

function Row({ label, onEdit, children }: { label: string; onEdit: () => void; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="text-footnote text-fg-muted w-24 shrink-0 pt-px">{label}</dt>
      <dd className="text-callout text-fg min-w-0 flex-1 break-words">{children}</dd>
      <button
        type="button"
        onClick={onEdit}
        className="text-footnote text-accent relative inline-flex shrink-0 items-center gap-1 rounded-sm after:absolute after:-inset-2"
        aria-label={`Edit ${label.toLowerCase()}`}
      >
        <Pencil className="size-3.5" strokeWidth={1.75} aria-hidden />
        Edit
      </button>
    </div>
  );
}

/** Step 4: the prize, then a plain summary of everything before the wallet is asked to confirm. */
export function StepPrize({ draft, set, errors, blur, goTo }: StepProps & { goTo: (step: number) => void }) {
  const prize = prizeFor(draft);
  const drip = dripFor(draft);
  const guests = draft.guestListOn ? parseTicketList(draft.guestListText).addresses.length : 0;
  return (
    <div className="flex flex-col gap-7">
      <Field
        label="Prize"
        error={errors.prizeEth}
        helper={`Paid in ${currencyLabel}. It is locked in the contract when you create the contest and paid to the winner. Enter 0 for no prize.`}
      >
        <Input
          inputMode="decimal"
          value={draft.prizeEth}
          onChange={(e) => set({ prizeEth: e.target.value })}
          onBlur={() => blur("prizeEth")}
          trailing="ETH"
          autoComplete="off"
          className="text-title-3 h-14"
        />
      </Field>
      {isTestnet ? (
        <p className="text-footnote text-fg-muted -mt-3">{currencyLabel} is free test money. It has no real value.</p>
      ) : null}

      <section aria-labelledby="review-h">
        <h3 id="review-h" className="text-footnote text-fg mb-1">
          Check everything
        </h3>
        <Card padding="sm" className="px-4 py-1">
          <dl className="divide-border divide-y">
            <Row label="Name" onEdit={() => goTo(0)}>
              {draft.title.trim() || <span className="text-fg-muted">Missing</span>}
            </Row>
            <Row label="Entries" onEdit={() => goTo(1)}>
              {draft.openSubmissions ? "Anyone can submit" : "Only you add them"}
              <span className="text-footnote text-fg-muted block tabular">Close {when(draft.submissionEnd)}</span>
            </Row>
            <Row label="Voting" onEdit={() => goTo(1)}>
              <span className="tabular">{when(draft.votingStart)}</span>
              <span className="text-footnote text-fg-muted tabular block">to {when(draft.votingEnd)}</span>
            </Row>
            <Row label="Who votes" onEdit={() => goTo(2)}>
              {draft.presence === "Anywhere" ? "Anyone, from anywhere" : draft.presence === "Room" ? "People in the room" : "People checked in at the door"}
              {guests > 0 ? (
                <span className="text-footnote text-fg-muted block tabular">Guest list: {guests.toLocaleString()} wallets</span>
              ) : null}
              {draft.presence === "Gated" ? (
                <span className="text-footnote text-fg-muted block tabular">
                  Gas money: {drip > 0n ? `${formatEth(drip, { maxDecimals: 6 })} ${currencyLabel}` : "none"}
                </span>
              ) : null}
            </Row>
            <Row label="Prize" onEdit={() => goTo(3)}>
              <span className="tabular">
                {parseEthInput(draft.prizeEth).ok ? (prize > 0n ? `${formatEth(prize, { maxDecimals: 6 })} ${currencyLabel}` : "No prize") : "Enter an amount"}
              </span>
            </Row>
          </dl>
        </Card>
        <p className="text-footnote text-fg-muted mt-3 text-pretty">
          Dates and the prize can&apos;t be changed after you create the contest. Your wallet will ask you to confirm
          {prize > 0n ? ` and send the ${formatEth(prize, { maxDecimals: 6 })} ${currencyLabel} prize` : ""}.
        </p>
      </section>
    </div>
  );
}

