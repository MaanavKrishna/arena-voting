"use client";

import { FileUp, Ticket } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { zeroHash } from "viem";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { TxButton } from "@/components/wallet/TxButton";
import { arenaKeys } from "@/hooks/shared";
import { useArena } from "@/hooks/useArena";
import { useArenaWrite } from "@/hooks/useArenaWrite";
import type { ContestView } from "@/hooks/types";
import { useTicketList } from "@/hooks/useTicketList";
import { explainError, type ExplainedError } from "@/lib/errors";
import { MAX_TICKETS, parseTicketList } from "@/lib/tickets";
import { ControlCard, Note } from "./ControlCard";
import { publishTicketList } from "./ticketPublish";

/** Why the guest list can't change right now, or `null` when it can. */
export function ticketListLock(c: Pick<ContestView, "checkedInCount">, phase: string | undefined): string | null {
  if (phase === "voting" || phase === "ended" || phase === "finalized") {
    return "Voting has started, so the guest list can't change anymore.";
  }
  if (c.checkedInCount > 0) {
    return "Check-in has started, so the guest list is locked. People have already been let in under it.";
  }
  return null;
}

export function TicketListCard({
  contestId,
  contest,
  phase,
}: {
  contestId: bigint;
  contest: ContestView;
  phase: string | undefined;
}) {
  const { chainId } = useArena();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const publish = useArenaWrite("setTicketList");
  const clear = useArenaWrite("setTicketList");
  const list = useTicketList(contestId);
  const fileRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<ExplainedError | null>(null);

  const parsed = useMemo(() => parseTicketList(text), [text]);
  const lock = ticketListLock(contest, phase);
  const hasList = contest.ticketRoot !== zeroHash;
  const gated = contest.presence === 2;
  const count = parsed.addresses.length;

  const reason =
    count === 0 && parsed.invalid.length === 0
      ? "Paste at least one wallet address."
      : parsed.invalid.length > 0
        ? `Fix or delete the ${parsed.invalid.length} line${parsed.invalid.length === 1 ? "" : "s"} marked above.`
        : parsed.error === "too-many"
          ? `A guest list can hold up to ${MAX_TICKETS.toLocaleString("en-US")} wallets.`
          : null;

  const refresh = () => queryClient.invalidateQueries({ queryKey: arenaKeys.contest(chainId, contestId) });

  const onPublish = async () => {
    if (reason) return;
    setUploadError(null);
    setUploading(true);
    let result: { root: `0x${string}`; uri: string };
    try {
      result = await publishTicketList(parsed.addresses);
    } catch (err) {
      setUploadError(explainError(err));
      setUploading(false);
      return;
    }
    setUploading(false);
    const hash = await publish.write({ args: [contestId, result.root, result.uri] });
    if (hash) {
      setText("");
      await refresh();
      toast({ tone: "success", title: `Guest list saved with ${count} wallet${count === 1 ? "" : "s"}.` });
    }
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setText(await file.text());
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <ControlCard
      id="tickets"
      icon={<Ticket strokeWidth={1.75} />}
      title="Guest list"
      description={
        gated
          ? "Only wallets on this list get through the door."
          : "Only wallets on this list can vote. Leave it empty to let anyone vote."
      }
      action={hasList ? <Badge tone="verified">On</Badge> : <Badge>Off</Badge>}
    >
      {hasList ? (
        <p className="text-callout text-fg">
          {list.tree ? (
            <>
              <span className="tabular font-medium">{list.tree.dump.values.length}</span> wallets on the list.
            </>
          ) : list.isError ? (
            "A guest list is set, but we couldn't load its contents just now."
          ) : (
            "A guest list is set. Loading its contents…"
          )}
        </p>
      ) : null}

      {lock ? (
        <Note tone="warning">{lock}</Note>
      ) : (
        <div className="flex flex-col gap-3">
          <Field
            label={hasList ? "Replace the list" : "Wallet addresses"}
            helper="One address per line, or separated by commas. You can also load a CSV file."
          >
            <Textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setUploadError(null);
                if (publish.status !== "idle") publish.reset();
              }}
              rows={5}
              placeholder={"0x70997970C51812dc3A010C7d01b50e0d17dc79C8\n0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"}
              spellCheck={false}
              className="font-mono text-footnote"
              disabled={uploading || publish.isBusy}
            />
          </Field>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            className="sr-only"
            aria-label="Load addresses from a file"
            tabIndex={-1}
            onChange={(e) => void readFile(e.target.files?.[0])}
          />
          {text.trim() !== "" ? (
            <div className="text-footnote flex flex-col gap-1" aria-live="polite">
              <p className="text-fg">
                <span className="tabular font-medium">{count}</span> valid wallet{count === 1 ? "" : "s"}
                {parsed.duplicates > 0 ? <span className="text-fg-muted"> · {parsed.duplicates} duplicate{parsed.duplicates === 1 ? "" : "s"} skipped</span> : null}
              </p>
              {parsed.invalid.slice(0, 3).map((i) => (
                <p key={`${i.line}-${i.value}`} className="text-danger-text truncate">
                  Line {i.line}: &ldquo;{i.value}&rdquo; isn&apos;t a wallet address
                </p>
              ))}
              {parsed.invalid.length > 3 ? (
                <p className="text-danger-text">and {parsed.invalid.length - 3} more</p>
              ) : null}
            </div>
          ) : null}
          {uploadError ? (
            <p role="alert" className="text-footnote text-danger-text">
              We couldn&apos;t save the list. {uploadError.title}
            </p>
          ) : null}
          <div className="flex flex-wrap items-start gap-2">
            <TxButton
              action={publish}
              onClick={() => void onPublish()}
              disabledReason={uploading ? null : reason}
              confirmedLabel="Guest list saved"
            >
              {uploading ? "Saving the list…" : hasList ? "Replace guest list" : "Save guest list"}
            </TxButton>
            <Button
              variant="secondary"
              icon={<FileUp className="size-4" strokeWidth={1.75} aria-hidden />}
              onClick={() => fileRef.current?.click()}
              disabled={uploading || publish.isBusy}
            >
              Load a file
            </Button>
          </div>
          {hasList ? (
            <TxButton
              action={clear}
              variant="ghost"
              size="sm"
              confirmedLabel="List removed"
              onClick={async () => {
                const hash = await clear.write({ args: [contestId, zeroHash, ""] });
                if (hash) {
                  await refresh();
                  toast({ tone: "success", title: "Guest list removed. Anyone can vote." });
                }
              }}
            >
              Remove the guest list
            </TxButton>
          ) : null}
        </div>
      )}
    </ControlCard>
  );
}
