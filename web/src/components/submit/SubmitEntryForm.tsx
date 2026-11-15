"use client";

import { Plus, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { TxButton } from "@/components/wallet/TxButton";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useArena } from "@/hooks/useArena";
import { useArenaWrite } from "@/hooks/useArenaWrite";
import { arenaKeys } from "@/hooks/shared";
import { useConnection } from "wagmi";
import { explainError, type ExplainedError } from "@/lib/errors";
import { uploadToIpfs } from "@/lib/ipfs";
import { ImageUpload } from "@/components/create/ImageUpload";
import {
  LIMITS,
  buildEntryMetadata,
  emptyEntryForm,
  entryArgs,
  firstProblem,
  hasErrors,
  validateEntryForm,
  type EntryFormValues,
} from "./entryForm";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-title-3 text-fg">{title}</h2>
        {hint ? <p className="text-footnote text-fg-muted mt-1">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * The entry form shared by `/c/[id]/submit` and the organiser's "Add entry" sheet. Uploads the
 * image and the metadata JSON to IPFS, then sends `submitEntry`. Calls `onSubmitted` once confirmed.
 */
export function SubmitEntryForm({
  contestId,
  onSubmitted,
  payeeHint,
}: {
  contestId: bigint;
  onSubmitted: () => void;
  /** Extra helper text under the prize wallet (e.g. for organisers adding entries for teams). */
  payeeHint?: string;
}) {
  const { chainId } = useArena();
  const { address: connected } = useConnection();
  const queryClient = useQueryClient();
  const action = useArenaWrite("submitEntry");

  const [values, setValues] = useState<EntryFormValues>(() => emptyEntryForm());
  const [payeeEdited, setPayeeEdited] = useState(false);
  const [imageUri, setImageUri] = useState("");
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [attempted, setAttempted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [uploadError, setUploadError] = useState<ExplainedError | null>(null);
  const uploaded = useRef<{ key: string; uri: string } | null>(null);

  const effective: EntryFormValues = useMemo(
    () => ({ ...values, payee: payeeEdited ? values.payee : (connected ?? "") }),
    [values, payeeEdited, connected],
  );
  const errors = useMemo(() => validateEntryForm(effective), [effective]);
  const invalid = hasErrors(errors);

  const set = <K extends keyof EntryFormValues>(key: K, value: EntryFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const touch = (key: string) => setTouched((t) => (t.has(key) ? t : new Set(t).add(key)));
  const show = (key: string) => attempted || touched.has(key);

  const busy = uploading || action.isBusy;

  const submit = async () => {
    setAttempted(true);
    if (invalid || imageBusy) return;
    setUploadError(null);
    setUploading(true);
    let metadataURI: string;
    try {
      const key = JSON.stringify([effective, imageUri]);
      if (uploaded.current?.key === key) {
        metadataURI = uploaded.current.uri;
      } else {
        metadataURI = await uploadToIpfs(buildEntryMetadata(effective, imageUri || undefined));
        uploaded.current = { key, uri: metadataURI };
      }
    } catch (err) {
      setUploadError(explainError(err));
      setUploading(false);
      return;
    }
    setUploading(false);
    const args = entryArgs(effective, metadataURI);
    const hash = await action.write({ args: [contestId, args.payee, args.metadataURI, args.members] });
    if (hash) {
      await queryClient.invalidateQueries({ queryKey: arenaKeys.contest(chainId, contestId) });
      onSubmitted();
    }
  };

  const updateLink = (i: number, patch: Partial<{ label: string; url: string }>) =>
    set(
      "links",
      values.links.map((l, j) => (j === i ? { ...l, ...patch } : l)),
    );
  const updateMember = (i: number, value: string) =>
    set(
      "members",
      values.members.map((m, j) => (j === i ? value : m)),
    );

  const disabledReason = busy
    ? null
    : imageBusy
      ? "Waiting for the image to finish uploading…"
      : invalid
        ? firstProblem(errors)
        : null;

  return (
    <form
      className="flex flex-col gap-10"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Section title="About your entry" hint="This is what voters see in the gallery.">
        <Field label="Name" counter={{ value: values.name, max: LIMITS.name }} error={show("name") ? errors.name : undefined}>
          <Input
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            onBlur={() => touch("name")}
            placeholder="Rocket Cart"
            autoComplete="off"
            disabled={busy}
          />
        </Field>
        <Field
          label="Tagline"
          optional
          counter={{ value: values.tagline, max: LIMITS.tagline }}
          error={show("tagline") ? errors.tagline : undefined}
        >
          <Input
            value={values.tagline}
            onChange={(e) => set("tagline", e.target.value)}
            onBlur={() => touch("tagline")}
            placeholder="One line that makes people curious"
            autoComplete="off"
            disabled={busy}
          />
        </Field>
        <Field
          label="Description"
          optional
          counter={{ value: values.description, max: LIMITS.description }}
          error={show("description") ? errors.description : undefined}
        >
          <Textarea
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            onBlur={() => touch("description")}
            rows={5}
            placeholder="What is it, who made it, why should people vote for it?"
            disabled={busy}
          />
        </Field>
      </Section>

      <Section title="Image" hint="Optional, but entries with an image get noticed.">
        <ImageUpload value={imageUri} onChange={setImageUri} onBusyChange={setImageBusy} label="Entry image" aspect="16 / 9" disabled={busy} />
      </Section>

      <Section title="Links" hint={`Optional. Up to ${LIMITS.links} links, each starting with https://`}>
        {values.links.map((l, i) => {
          const err = errors.links[i];
          return (
            <div key={i} className="grid grid-cols-[1fr_auto] items-start gap-x-2 gap-y-3 sm:grid-cols-[10rem_1fr_auto]">
              <Field label="Label" className="col-span-1" error={show(`link-${i}`) ? err?.label : undefined}>
                <Input
                  value={l.label}
                  onChange={(e) => updateLink(i, { label: e.target.value })}
                  onBlur={() => touch(`link-${i}`)}
                  placeholder="Demo"
                  autoComplete="off"
                  disabled={busy}
                />
              </Field>
              <Field label="Link" className="order-3 col-span-2 sm:order-none sm:col-span-1" error={show(`link-${i}`) ? err?.url : undefined}>
                <Input
                  value={l.url}
                  onChange={(e) => updateLink(i, { url: e.target.value })}
                  onBlur={() => touch(`link-${i}`)}
                  placeholder="https://"
                  inputMode="url"
                  autoComplete="off"
                  disabled={busy}
                />
              </Field>
              <Button
                variant="ghost"
                aria-label={`Remove link ${i + 1}`}
                className="mt-6"
                icon={<X className="size-4" strokeWidth={1.75} aria-hidden />}
                onClick={() => set("links", values.links.filter((_, j) => j !== i))}
                disabled={busy}
              />
            </div>
          );
        })}
        {values.links.length < LIMITS.links ? (
          <div>
            <Button
              variant="secondary"
              size="sm"
              icon={<Plus className="size-4" strokeWidth={1.75} aria-hidden />}
              onClick={() => set("links", [...values.links, { label: "", url: "" }])}
              disabled={busy}
            >
              Add a link
            </Button>
          </div>
        ) : null}
      </Section>

      <Section
        title="Prize wallet and team"
        hint="If this entry wins, the prize goes to the prize wallet. Everyone listed here can't vote for this entry."
      >
        <Field
          label="Prize wallet"
          helper={payeeHint ?? (payeeEdited || !connected ? undefined : "Your connected wallet. Change it if the prize should go elsewhere.")}
          error={show("payee") ? errors.payee : undefined}
        >
          <Input
            value={effective.payee}
            onChange={(e) => {
              setPayeeEdited(true);
              set("payee", e.target.value);
            }}
            onBlur={() => touch("payee")}
            placeholder="0x…"
            spellCheck={false}
            autoComplete="off"
            className="font-mono text-footnote"
            disabled={busy}
          />
        </Field>
        {payeeEdited && connected && effective.payee.trim().toLowerCase() !== connected.toLowerCase() ? (
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPayeeEdited(false);
                set("payee", "");
              }}
              disabled={busy}
            >
              Use my connected wallet
            </Button>
          </div>
        ) : null}

        {values.members.map((m, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto] items-start gap-2">
            <Field label={`Team member ${i + 1}`} error={show(`member-${i}`) ? errors.members[i] : undefined}>
              <Input
                value={m}
                onChange={(e) => updateMember(i, e.target.value)}
                onBlur={() => touch(`member-${i}`)}
                placeholder="0x…"
                spellCheck={false}
                autoComplete="off"
                className="font-mono text-footnote"
                disabled={busy}
              />
            </Field>
            <Button
              variant="ghost"
              aria-label={`Remove team member ${i + 1}`}
              className="mt-6"
              icon={<X className="size-4" strokeWidth={1.75} aria-hidden />}
              onClick={() => set("members", values.members.filter((_, j) => j !== i))}
              disabled={busy}
            />
          </div>
        ))}
        {values.members.length < LIMITS.members ? (
          <div>
            <Button
              variant="secondary"
              size="sm"
              icon={<Plus className="size-4" strokeWidth={1.75} aria-hidden />}
              onClick={() => set("members", [...values.members, ""])}
              disabled={busy}
            >
              Add a team member
            </Button>
          </div>
        ) : null}
      </Section>

      <div className="flex flex-col gap-3">
        {uploadError ? (
          <div role="alert" className="bg-danger/10 text-danger-text text-footnote rounded-md px-4 py-3">
            <p className="font-medium">We couldn&apos;t upload your entry.</p>
            <p>{uploadError.title} Your entry hasn&apos;t been submitted.</p>
          </div>
        ) : null}
        <TxButton
          action={action}
          onClick={() => void submit()}
          disabledReason={disabledReason}
          confirmedLabel="Entry submitted"
          size="lg"
          fullWidth
        >
          {uploading ? "Uploading your entry…" : "Submit entry"}
        </TxButton>
      </div>
    </form>
  );
}

