import { getAddress, isAddress, zeroAddress, type Address } from "viem";
import { EntryMetadata } from "@/lib/metadata";
import { byteLength } from "@/lib/format";

export const LIMITS = {
  name: 60,
  tagline: 120,
  description: 1000,
  linkLabel: 40,
  linkUrl: 200,
  links: 4,
  members: 8,
} as const;

export type LinkRow = { label: string; url: string };

export type EntryFormValues = {
  name: string;
  tagline: string;
  description: string;
  links: LinkRow[];
  payee: string;
  members: string[];
};

export type EntryFormErrors = {
  name?: string;
  tagline?: string;
  description?: string;
  payee?: string;
  /** Index-aligned with `values.links`. */
  links: ({ label?: string; url?: string } | undefined)[];
  /** Index-aligned with `values.members`. */
  members: (string | undefined)[];
};

export const emptyEntryForm = (payee = ""): EntryFormValues => ({
  name: "",
  tagline: "",
  description: "",
  links: [],
  payee,
  members: [],
});

const isEmptyLink = (l: LinkRow) => l.label.trim() === "" && l.url.trim() === "";

/** Links the form will actually send: fully blank rows are dropped. */
export function cleanLinks(links: LinkRow[]): LinkRow[] {
  return links.filter((l) => !isEmptyLink(l)).map((l) => ({ label: l.label.trim(), url: l.url.trim() }));
}

/** Member addresses the form will actually send: blank rows are dropped. */
export function cleanMembers(members: string[]): string[] {
  return members.map((m) => m.trim()).filter((m) => m !== "");
}

function isHttps(url: string): boolean {
  if (!url.toLowerCase().startsWith("https://")) return false;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

function addressProblem(value: string): string | undefined {
  if (!isAddress(value, { strict: false })) return "That doesn't look like a wallet address (0x followed by 40 characters).";
  if (getAddress(value) === zeroAddress) return "The zero address can't be used.";
  return undefined;
}

export function validateEntryForm(v: EntryFormValues): EntryFormErrors {
  const errors: EntryFormErrors = { links: [], members: [] };

  const name = v.name.trim();
  if (name === "") errors.name = "Give your entry a name.";
  else if (byteLength(name) > LIMITS.name) errors.name = `Keep the name under ${LIMITS.name} characters.`;
  if (byteLength(v.tagline.trim()) > LIMITS.tagline) errors.tagline = "That tagline is too long.";
  if (byteLength(v.description.trim()) > LIMITS.description) errors.description = "That description is too long.";

  const payee = v.payee.trim();
  if (payee === "") errors.payee = "Add the wallet that should receive the prize.";
  else errors.payee = addressProblem(payee);

  v.links.forEach((l, i) => {
    if (isEmptyLink(l)) return;
    const label = l.label.trim();
    const url = l.url.trim();
    const row: { label?: string; url?: string } = {};
    if (label === "") row.label = "Add a label.";
    else if (byteLength(label) > LIMITS.linkLabel) row.label = "Label is too long.";
    if (url === "") row.url = "Add the link.";
    else if (byteLength(url) > LIMITS.linkUrl) row.url = "That link is too long.";
    else if (!isHttps(url)) row.url = "Links must start with https://";
    if (row.label || row.url) errors.links[i] = row;
  });

  const payeeKey = isAddress(payee, { strict: false }) ? payee.toLowerCase() : null;
  const seen = new Set<string>();
  v.members.forEach((raw, i) => {
    const m = raw.trim();
    if (m === "") return;
    const problem = addressProblem(m);
    if (problem) {
      errors.members[i] = problem;
      return;
    }
    const key = m.toLowerCase();
    if (payeeKey && key === payeeKey) errors.members[i] = "The prize wallet is already on the team. Remove it from this list.";
    else if (seen.has(key)) errors.members[i] = "This address is already in the list.";
    seen.add(key);
  });

  return errors;
}

export function hasErrors(e: EntryFormErrors): boolean {
  return Boolean(e.name || e.tagline || e.description || e.payee || e.links.some(Boolean) || e.members.some(Boolean));
}

/** First problem in reading order, for the button's "why is this disabled" line. */
export function firstProblem(e: EntryFormErrors): string | null {
  return (
    e.name ?? e.tagline ?? e.description ?? e.payee ?? e.links.find(Boolean)?.label ?? e.links.find(Boolean)?.url ?? e.members.find(Boolean) ?? null
  );
}

/** The EntryMetadata JSON that goes to IPFS. Throws (zod) if the values break the published limits. */
export function buildEntryMetadata(v: EntryFormValues, imageUri?: string): EntryMetadata {
  const links = cleanLinks(v.links);
  return EntryMetadata.parse({
    version: 1,
    name: v.name.trim(),
    tagline: v.tagline.trim(),
    description: v.description.trim(),
    ...(imageUri ? { image: imageUri } : {}),
    ...(links.length > 0 ? { links } : {}),
  });
}

/** `submitEntry` arguments after the contest id. */
export function entryArgs(v: EntryFormValues, metadataURI: string): { payee: Address; metadataURI: string; members: Address[] } {
  return {
    payee: getAddress(v.payee.trim()),
    metadataURI,
    members: cleanMembers(v.members).map((m) => getAddress(m)),
  };
}
