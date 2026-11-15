"use client";

import { ArrowLeft, ArrowRight, ChevronDown, Eye } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { parseEventLogs, type Hex } from "viem";
import { TxButton } from "@/components/wallet/TxButton";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useIsClient, useReducedMotionPref } from "@/components/ui/hooks";
import { useChainTime } from "@/hooks/useChainTime";
import { useArena } from "@/hooks/useArena";
import { useArenaWrite } from "@/hooks/useArenaWrite";
import { arenaAbi } from "@/generated";
import { cn } from "@/lib/cn";
import { uploadToIpfs } from "@/lib/ipfs";
import { ContestMetadata, type TicketList } from "@/lib/metadata";
import { spring, fade } from "@/lib/motion";
import { buildTicketTree, parseTicketList } from "@/lib/tickets";
import {
  DRAFT_KEY,
  STEPS,
  buildCreateArgs,
  firstInvalidStep,
  loadDraft,
  prizeFor,
  saveDraft,
  validateStep,
  type Draft,
  type Errors,
} from "./draft";
import { PreviewCard } from "./PreviewCard";
import { StepBasics } from "./StepBasics";
import { StepIndicator } from "./StepIndicator";
import { StepPrize } from "./StepPrize";
import { StepTiming } from "./StepTiming";
import { StepVoters } from "./StepVoters";

const HEADINGS = [
  { title: "Name your contest", body: "What people will see first." },
  { title: "When does it happen?", body: "Pick when entries close and when voting runs." },
  { title: "Who can vote?", body: "Decide who gets a say, and how they prove it." },
  { title: "Set the prize", body: "Then take a last look before you create it." },
] as const;

/** Reads the draft from sessionStorage on the client, then hands it to the wizard. */
export function CreateWizard() {
  const client = useIsClient();
  if (!client) {
    return (
      <div className="flex flex-col gap-4" aria-busy>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  return <Wizard initial={loadDraft(window.sessionStorage)} />;
}

function Wizard({ initial }: { initial: { draft: Draft; step: number } }) {
  const router = useRouter();
  const reduce = useReducedMotionPref();
  const { address: arena } = useArena();
  const chain = useChainTime();
  const now = Number(chain.now);

  const [draft, setDraft] = useState<Draft>(initial.draft);
  const [step, setStep] = useState(initial.step);
  const [furthest, setFurthest] = useState(initial.step);
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [attempted, setAttempted] = useState<ReadonlySet<number>>(new Set());
  const [previewOpen, setPreviewOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const write = useArenaWrite("createContest");
  const uploaded = useRef(new Map<string, string>());
  const finished = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Keep the draft across refreshes.
  useEffect(() => {
    if (!finished.current) saveDraft(window.sessionStorage, draft, step);
  }, [draft, step]);

  // After the first render, move focus to the new step's heading.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }, [step, reduce]);

  // Success: read the new id from the receipt and go to the control room.
  const createdId = useMemo(() => {
    if (!write.receipt) return null;
    const logs = parseEventLogs({ abi: arenaAbi, eventName: "ContestCreated", logs: write.receipt.logs });
    const own = logs.find((l) => !arena || l.address.toLowerCase() === arena.toLowerCase()) ?? logs[0];
    return own ? own.args.contestId : null;
  }, [write.receipt, arena]);
  useEffect(() => {
    if (createdId === null) return;
    finished.current = true;
    window.sessionStorage.removeItem(DRAFT_KEY);
    router.push(`/c/${createdId}/manage`);
  }, [createdId, router]);

  const stepErrors = validateStep(step, draft, now);
  const visible: Errors = {};
  for (const [k, v] of Object.entries(stepErrors)) {
    if (touched.has(k) || attempted.has(step)) visible[k as keyof Errors] = v;
  }

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const blur = (field: keyof Errors) => setTouched((t) => new Set(t).add(field));
  const goTo = (i: number) => {
    setStep(i);
    setFurthest((f) => Math.max(f, i));
  };
  const next = () => {
    if (Object.keys(stepErrors).length > 0) {
      setAttempted((a) => new Set(a).add(step));
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus({ preventScroll: false }),
      );
      return;
    }
    goTo(step + 1);
  };

  const badStep = firstInvalidStep(draft, now);
  const disabledReason = !chain.ready
    ? "Syncing with the network…"
    : badStep >= 0
      ? `Finish “${STEPS[badStep].label}” first.`
      : null;

  async function create() {
    const bad = firstInvalidStep(draft, now);
    if (bad >= 0) {
      setAttempted((a) => new Set(a).add(bad));
      goTo(bad);
      return;
    }
    setUploadError(null);
    setUploading(true);
    let metadataURI: string;
    let ticketRoot: Hex | undefined;
    let ticketListURI: string | undefined;
    try {
      const metadata = ContestMetadata.parse({
        version: 1,
        description: draft.description.trim(),
        ...(draft.cover ? { cover: draft.cover } : {}),
      });
      const metaKey = `meta:${JSON.stringify(metadata)}`;
      metadataURI = uploaded.current.get(metaKey) ?? (await uploadToIpfs(metadata));
      uploaded.current.set(metaKey, metadataURI);

      if (draft.guestListOn) {
        const tree = buildTicketTree(parseTicketList(draft.guestListText).addresses);
        const list: TicketList = { version: 1, format: "oz-standard-merkle-tree", tree: { ...tree.dump } };
        const listKey = `tickets:${tree.root}`;
        ticketListURI = uploaded.current.get(listKey) ?? (await uploadToIpfs(list));
        uploaded.current.set(listKey, ticketListURI);
        ticketRoot = tree.root;
      }
    } catch {
      setUploadError("We couldn't save your contest details online. Check your connection and try again. Nothing was sent to your wallet.");
      setUploading(false);
      return;
    }
    setUploading(false);
    await write.write({
      args: [buildCreateArgs(draft, { metadataURI, ticketRoot, ticketListURI })],
      value: prizeFor(draft),
    });
  }

  const busy = uploading || write.isBusy;
  const txAction = {
    status: uploading ? ("simulating" as const) : write.status,
    isBusy: busy,
    error: write.error,
    txHash: write.txHash,
  };

  const stepProps = { draft, set, errors: visible, blur, now };
  const last = step === STEPS.length - 1;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-title-1 text-fg">Create a contest</h1>
        <p className="text-callout text-fg-muted">Four quick steps. Your answers are kept if you refresh.</p>
      </header>

      <StepIndicator step={step} furthest={furthest} onGo={goTo} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="lg:hidden">
            <button
              type="button"
              aria-expanded={previewOpen}
              aria-controls="create-preview"
              onClick={() => setPreviewOpen((o) => !o)}
              className="text-callout text-fg-muted hover:text-fg flex min-h-11 w-full items-center justify-between gap-3 rounded-sm transition-colors"
            >
              <span className="inline-flex items-center gap-2">
                <Eye className="size-4" strokeWidth={1.75} aria-hidden />
                {previewOpen ? "Hide preview" : "Preview your contest"}
              </span>
              <ChevronDown className={cn("size-4 transition-transform duration-200", previewOpen && "rotate-180")} strokeWidth={1.75} aria-hidden />
            </button>
            <AnimatePresence initial={false}>
              {previewOpen ? (
                <motion.div
                  id="create-preview"
                  initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
                  exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  transition={reduce ? fade : spring.smooth}
                  className="overflow-hidden"
                >
                  <div className="pt-2 pb-1">
                    <PreviewCard draft={draft} />
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <Card padding="lg" className="flex flex-col gap-7">
            <div>
              <h2 ref={heading} tabIndex={-1} className="text-title-2 text-fg scroll-mt-24 outline-none">
                {HEADINGS[step].title}
              </h2>
              <p className="text-callout text-fg-muted mt-1">{HEADINGS[step].body}</p>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
                animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={reduce ? fade : { ...spring.smooth, opacity: fade }}
              >
                {step === 0 ? <StepBasics {...stepProps} /> : null}
                {step === 1 ? <StepTiming {...stepProps} /> : null}
                {step === 2 ? <StepVoters {...stepProps} /> : null}
                {step === 3 ? <StepPrize {...stepProps} goTo={goTo} /> : null}
              </motion.div>
            </AnimatePresence>

            <div className="flex flex-col gap-3">
              {uploadError ? (
                <p role="alert" className="text-footnote text-danger-text">
                  {uploadError}
                </p>
              ) : null}
              {last && write.status === "confirmed" && createdId === null ? (
                <p role="status" className="text-footnote text-fg-muted">
                  Your contest was created, but we couldn&apos;t read its number. Find it on the Explore page.
                </p>
              ) : null}
              <div className="flex items-center gap-3">
                {step > 0 ? (
                  <Button
                    variant="ghost"
                    size="lg"
                    disabled={busy}
                    onClick={() => goTo(step - 1)}
                    icon={<ArrowLeft className="size-5" strokeWidth={1.75} aria-hidden />}
                  >
                    Back
                  </Button>
                ) : null}
                <div className="ml-auto min-w-0 flex-1 sm:max-w-xs">
                  {last ? (
                    <TxButton
                      action={txAction}
                      onClick={() => void create()}
                      disabledReason={disabledReason}
                      confirmedLabel="Created"
                      size="lg"
                      fullWidth
                    >
                      {uploading ? "Saving details…" : "Create contest"}
                    </TxButton>
                  ) : (
                    <Button size="lg" className="w-full" onClick={next} iconAfter={<ArrowRight className="size-5" strokeWidth={1.75} aria-hidden />}>
                      Next
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>

        <aside aria-label="Preview" className="sticky top-24 hidden lg:block">
          <p className="text-footnote text-fg-muted mb-2">Preview</p>
          <PreviewCard draft={draft} />
        </aside>
      </div>
    </div>
  );
}
