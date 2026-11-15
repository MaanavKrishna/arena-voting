"use client";

import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Textarea } from "@/components/ui/Textarea";
import { Toggle } from "@/components/ui/Toggle";
import { currencyLabel } from "@/config/network";
import { MAX_TICKETS, parseTicketList } from "@/lib/tickets";
import { PRESENCE, type Presence, type StepProps } from "./draft";

const MODES: Record<Presence, { label: string; body: string }> = {
  Anywhere: {
    label: "Anywhere",
    body: "Anyone with the link can vote from wherever they are. Best for online contests.",
  },
  Room: {
    label: "Room",
    body: "Voters have to be in the room. Your Stage screen plays an inaudible sound and shows a code that phones pick up before they can vote.",
  },
  Gated: {
    label: "Door",
    body: "Everything in the room mode, plus a check at the door: guests show a live pass on their phone and get a little gas money to vote. Best for ticketed events.",
  },
};

const MAX_FILE_BYTES = 512 * 1024;

export function StepVoters({ draft, set, errors, blur }: StepProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileNote, setFileNote] = useState<string | null>(null);
  const list = draft.guestListOn ? parseTicketList(draft.guestListText) : null;

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileNote(null);
    if (file.size > MAX_FILE_BYTES) {
      setFileNote("That file is too big for a guest list. Keep it under 500 KB.");
    } else {
      const text = await file.text();
      set({ guestListText: draft.guestListText.trim() ? `${draft.guestListText.trim()}\n${text}` : text });
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-7">
      <section className="flex flex-col gap-3" aria-labelledby="presence-h">
        <h3 id="presence-h" className="text-footnote text-fg">
          Where do people vote from?
        </h3>
        <SegmentedControl
          aria-label="Where people vote from"
          stretch
          value={draft.presence}
          onChange={(presence) => set({ presence })}
          options={PRESENCE.map((p) => ({ value: p, label: MODES[p].label }))}
        />
        <p className="text-footnote text-fg-muted text-pretty" aria-live="polite">
          {MODES[draft.presence].body}
        </p>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="guests-h">
        <h3 id="guests-h" className="sr-only">
          Guest list
        </h3>
        <Toggle
          checked={draft.guestListOn}
          onCheckedChange={(guestListOn) => set({ guestListOn })}
          label="Only let a guest list vote"
          description={
            draft.presence === "Gated"
              ? "Only wallets on the list get through the door."
              : "Only wallets on the list can vote. Everyone else can watch."
          }
          className="w-full"
        />
        {draft.guestListOn ? (
          <div className="flex flex-col gap-3">
            <Field
              label="Wallet addresses"
              error={errors.guestList}
              helper={`Paste addresses separated by commas, spaces or new lines. Up to ${MAX_TICKETS.toLocaleString()}.`}
            >
              <Textarea
                value={draft.guestListText}
                onChange={(e) => set({ guestListText: e.target.value })}
                onBlur={() => blur("guestList")}
                rows={5}
                spellCheck={false}
                autoCapitalize="off"
                placeholder={"0x1234…\n0xabcd…"}
                className="text-footnote font-mono"
              />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                className="sr-only"
                tabIndex={-1}
                aria-label="Upload a CSV or text file of addresses"
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
              <Button
                size="sm"
                variant="secondary"
                icon={<Upload className="size-4" strokeWidth={1.75} aria-hidden />}
                onClick={() => fileRef.current?.click()}
              >
                Add a CSV file
              </Button>
              {list ? (
                <p className="text-footnote text-fg-muted tabular" aria-live="polite">
                  <span className="text-fg">{list.addresses.length.toLocaleString()}</span>{" "}
                  {list.addresses.length === 1 ? "wallet" : "wallets"}
                  {list.duplicates > 0 ? ` · ${list.duplicates} duplicate${list.duplicates === 1 ? "" : "s"} removed` : ""}
                </p>
              ) : null}
            </div>
            {fileNote ? (
              <p role="alert" className="text-footnote text-danger-text">
                {fileNote}
              </p>
            ) : null}
            {list && list.invalid.length > 0 ? (
              <ul className="text-footnote text-danger-text flex flex-col gap-0.5" aria-label="Lines to fix">
                {list.invalid.slice(0, 5).map((x, i) => (
                  <li key={`${x.line}-${i}`} className="break-all">
                    Line {x.line}: <span className="font-mono">{x.value.length > 24 ? `${x.value.slice(0, 22)}…` : x.value}</span>
                  </li>
                ))}
                {list.invalid.length > 5 ? <li>and {list.invalid.length - 5} more</li> : null}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>

      {draft.presence === "Gated" ? (
        <Field
          label="Gas money at check-in"
          error={errors.dripEth}
          helper={`Your door device can send each guest up to this much ${currencyLabel} when they check in, so they can pay to vote. The most you can set is 0.01.`}
        >
          <Input
            inputMode="decimal"
            value={draft.dripEth}
            onChange={(e) => set({ dripEth: e.target.value })}
            onBlur={() => blur("dripEth")}
            trailing="ETH"
            autoComplete="off"
          />
        </Field>
      ) : null}
    </div>
  );
}
