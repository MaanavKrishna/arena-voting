"use client";

import { Plus, Trash2, Trophy } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { TxButton } from "@/components/wallet/TxButton";
import { SubmitEntryForm } from "@/components/submit/SubmitEntryForm";
import { arenaKeys } from "@/hooks/shared";
import { useArena } from "@/hooks/useArena";
import { useArenaWrite } from "@/hooks/useArenaWrite";
import type { ContestView } from "@/hooks/types";
import type { EntryWithMetadata } from "@/hooks/useEntries";
import { ipfsDisplayUrl } from "@/lib/ipfs";
import { shortAddress } from "@/lib/format";
import { ControlCard, Note } from "./ControlCard";

const MAX_ENTRIES = 64;

function Thumb({ entry }: { entry: EntryWithMetadata }) {
  const src = entry.metadata.image ? ipfsDisplayUrl(entry.metadata.image) : null;
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- gateway URL, size unknown
    <img src={src} alt="" className="bg-fg/6 size-12 shrink-0 rounded-sm object-cover" loading="lazy" />
  ) : (
    <span aria-hidden className="bg-fg/6 text-fg-subtle grid size-12 shrink-0 place-items-center rounded-sm">
      <Trophy className="size-5" strokeWidth={1.75} />
    </span>
  );
}

function RemoveSheet({
  contestId,
  entry,
  onClose,
}: {
  contestId: bigint;
  entry: EntryWithMetadata | null;
  onClose: () => void;
}) {
  const remove = useArenaWrite("removeEntry");
  const queryClient = useQueryClient();
  const { chainId } = useArena();
  const { toast } = useToast();
  return (
    <Sheet
      open={entry !== null}
      onOpenChange={(o) => {
        if (!o) {
          remove.reset();
          onClose();
        }
      }}
      title={entry ? `Remove “${entry.metadata.name}”?` : "Remove entry"}
      description="It disappears from the gallery for everyone. You can't undo this, but you can add it again as a new entry."
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Keep it
          </Button>
          <TxButton
            variant="danger"
            fullWidth
            action={remove}
            confirmedLabel="Removed"
            onClick={async () => {
              if (!entry) return;
              const hash = await remove.write({ args: [contestId, entry.id] });
              if (hash) {
                await queryClient.invalidateQueries({ queryKey: arenaKeys.contest(chainId, contestId) });
                toast({ tone: "success", title: "Entry removed." });
                remove.reset();
                onClose();
              }
            }}
          >
            Remove entry
          </TxButton>
        </div>
      }
    >
      {entry ? <p className="text-callout text-fg-muted">{entry.metadata.tagline || "No tagline"}</p> : null}
    </Sheet>
  );
}

export function EntriesAdmin({
  contestId,
  contest,
  phase,
  entries,
  isPending,
  isError,
  onRetry,
}: {
  contestId: bigint;
  contest: ContestView;
  phase: string | undefined;
  entries: EntryWithMetadata[] | undefined;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<EntryWithMetadata | null>(null);
  const { toast } = useToast();

  const canEdit = phase === "submissions" || phase === "upcoming";
  const canAdd = phase === "submissions" && contest.entryCount < MAX_ENTRIES;
  const live = (entries ?? []).filter((e) => !e.removed);
  const removed = (entries ?? []).length - live.length;

  const addNote =
    phase !== "submissions"
      ? "The entry deadline has passed, so no more can be added."
      : contest.entryCount >= MAX_ENTRIES
        ? `This contest holds ${MAX_ENTRIES} entries at most, removed ones included.`
        : null;

  return (
    <ControlCard
      id="entries"
      icon={<Trophy strokeWidth={1.75} />}
      title="Entries"
      description={
        contest.openSubmissions
          ? "Anyone can submit until the deadline. You can add or remove entries before voting opens."
          : "Curated: only you add entries. You can also remove them until voting opens."
      }
      span={2}
      action={
        <Button
          size="sm"
          icon={<Plus className="size-4" strokeWidth={1.75} aria-hidden />}
          onClick={() => setAdding(true)}
          disabled={!canAdd}
        >
          Add entry
        </Button>
      }
    >
      {isPending ? (
        <div role="status" aria-label="Loading entries" className="flex flex-col gap-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : isError ? (
        <ErrorState title="We couldn't load the entries." onRetry={onRetry} className="py-6" />
      ) : live.length === 0 ? (
        <Note>No entries yet. Add the first one to get the gallery going.</Note>
      ) : (
        <ul className="divide-border -my-1 max-h-96 divide-y overflow-y-auto">
          {live.map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-3">
              <Thumb entry={e} />
              <div className="min-w-0 flex-1">
                <p className="text-callout text-fg truncate font-medium">{e.metadata.name}</p>
                <p className="text-footnote text-fg-muted truncate">
                  {e.metadata.tagline || `Prize wallet ${shortAddress(e.payee)}`}
                </p>
              </div>
              <Badge tone="neutral" className="tabular shrink-0">
                {e.votes} vote{e.votes === 1 ? "" : "s"}
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Remove ${e.metadata.name}`}
                icon={<Trash2 className="size-4" strokeWidth={1.75} aria-hidden />}
                onClick={() => setRemoving(e)}
                disabled={!canEdit}
              />
            </li>
          ))}
        </ul>
      )}
      {removed > 0 ? (
        <p className="text-footnote text-fg-muted">
          {removed} removed entr{removed === 1 ? "y" : "ies"} hidden from the gallery.
        </p>
      ) : null}
      {!canEdit ? (
        <Note>Voting has opened, so entries are locked. Nothing can be added or removed now.</Note>
      ) : addNote ? (
        <Note>{addNote}</Note>
      ) : null}

      <Sheet
        open={adding}
        onOpenChange={setAdding}
        title="Add an entry"
        description="You'll confirm one transaction in your wallet."
        className="md:max-w-xl"
      >
        <SubmitEntryForm
          contestId={contestId}
          payeeHint="Where this team's prize should go if they win. Set it to the team's wallet, not yours."
          onSubmitted={() => {
            setAdding(false);
            toast({ tone: "success", title: "Entry added." });
          }}
        />
      </Sheet>
      <RemoveSheet contestId={contestId} entry={removing} onClose={() => setRemoving(null)} />
    </ControlCard>
  );
}
