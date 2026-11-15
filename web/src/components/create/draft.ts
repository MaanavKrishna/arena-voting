import { parseEther, zeroHash, type Hex } from "viem";
import { localInputToUnix, toLocalInputValue } from "@/components/ui/DateTimeField";
import { byteLength } from "@/lib/format";
import { MAX_TICKETS, parseTicketList, type TicketParse } from "@/lib/tickets";

/** Contract limits (docs/contracts.md "Constants"). Mirrored here so the form can explain them. */
export const LIMITS = {
  titleBytes: 80,
  descriptionBytes: 1000,
  minVotingSeconds: 5 * 60,
  maxVotingSeconds: 7 * 24 * 3600,
  maxLeadSeconds: 60 * 24 * 3600,
  maxDripWei: 10_000_000_000_000_000n, // 0.01 ether
} as const;

export const PRESENCE = ["Anywhere", "Room", "Gated"] as const;
export type Presence = (typeof PRESENCE)[number];

export const DEFAULT_DRIP = "0.003";

export type Draft = {
  title: string;
  description: string;
  /** `ipfs://<cid>` of the uploaded cover, if any. */
  cover: string;
  openSubmissions: boolean;
  /** `YYYY-MM-DDTHH:mm` in local time (datetime-local format). */
  submissionEnd: string;
  votingStart: string;
  votingEnd: string;
  presence: Presence;
  guestListOn: boolean;
  guestListText: string;
  dripEth: string;
  prizeEth: string;
};

export const emptyDraft: Draft = {
  title: "",
  description: "",
  cover: "",
  openSubmissions: false,
  submissionEnd: "",
  votingStart: "",
  votingEnd: "",
  presence: "Room",
  guestListOn: false,
  guestListText: "",
  dripEth: DEFAULT_DRIP,
  prizeEth: "0",
};

export const STEPS = [
  { id: "basics", label: "Basics" },
  { id: "timing", label: "Timing" },
  { id: "voters", label: "Who can vote" },
  { id: "prize", label: "Prize" },
] as const;
export type StepId = (typeof STEPS)[number]["id"];

export type Errors = Partial<Record<keyof Draft | "guestList", string>>;

// ---- storage ----

export const DRAFT_KEY = "arena:create-draft:v1";

export function loadDraft(storage: Pick<Storage, "getItem"> | undefined): { draft: Draft; step: number } {
  try {
    const raw = storage?.getItem(DRAFT_KEY);
    if (!raw) return { draft: emptyDraft, step: 0 };
    const parsed = JSON.parse(raw) as { draft?: Partial<Draft>; step?: unknown };
    const draft: Draft = { ...emptyDraft };
    for (const key of Object.keys(emptyDraft) as (keyof Draft)[]) {
      const v = parsed.draft?.[key];
      if (typeof v === typeof emptyDraft[key]) (draft as Record<string, unknown>)[key] = v;
    }
    if (!(PRESENCE as readonly string[]).includes(draft.presence)) draft.presence = emptyDraft.presence;
    const step = typeof parsed.step === "number" && parsed.step >= 0 && parsed.step < STEPS.length ? parsed.step : 0;
    return { draft, step };
  } catch {
    return { draft: emptyDraft, step: 0 };
  }
}

export function saveDraft(storage: Pick<Storage, "setItem"> | undefined, draft: Draft, step: number) {
  try {
    storage?.setItem(DRAFT_KEY, JSON.stringify({ draft, step }));
  } catch {
    // storage full or blocked: the draft just isn't kept
  }
}

// ---- presets ----

const MIN = 60;
const HOUR = 3600;
const roundUp5 = (ms: number) => Math.ceil(ms / 300_000) * 300_000;

export type TimingPreset = "demo-day" | "weekend";

/** Local-time field values for a preset, relative to `nowSec` (chain time). */
export function presetTimes(preset: TimingPreset, nowSec: number): Pick<Draft, "submissionEnd" | "votingStart" | "votingEnd"> {
  const now = new Date(nowSec * 1000);
  const fmt = (ms: number) => toLocalInputValue(new Date(ms));
  if (preset === "demo-day") {
    const close = roundUp5((nowSec + HOUR) * 1000);
    return { submissionEnd: fmt(close), votingStart: fmt(close), votingEnd: fmt(close + HOUR * 1000) };
  }
  const dow = now.getDay(); // 0 Sun … 6 Sat
  if (dow === 0 || dow === 6) {
    const close = roundUp5((nowSec + 2 * HOUR) * 1000);
    return { submissionEnd: fmt(close), votingStart: fmt(close), votingEnd: fmt(close + 24 * HOUR * 1000) };
  }
  const sat = new Date(now);
  sat.setDate(now.getDate() + (6 - dow));
  sat.setHours(10, 0, 0, 0);
  const start = new Date(sat);
  start.setHours(12, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { submissionEnd: fmt(sat.getTime()), votingStart: fmt(start.getTime()), votingEnd: fmt(end.getTime()) };
}

// ---- validation ----

function duration(seconds: number): string {
  if (seconds < HOUR) return `${Math.round(seconds / MIN)} minutes`;
  if (seconds < 24 * HOUR) return `${+(seconds / HOUR).toFixed(1)} hours`;
  return `${+(seconds / (24 * HOUR)).toFixed(1)} days`;
}

export function validateBasics(d: Draft): Errors {
  const e: Errors = {};
  const title = d.title.trim();
  if (title.length === 0) e.title = "Give your contest a name.";
  else if (byteLength(d.title) > LIMITS.titleBytes) {
    e.title = `Keep the name under ${LIMITS.titleBytes} bytes (emoji and accents count as more than one).`;
  }
  if (byteLength(d.description) > LIMITS.descriptionBytes) {
    e.description = `Keep the description under ${LIMITS.descriptionBytes} bytes (emoji and accents count as more than one).`;
  }
  return e;
}

/** `nowSec` is chain time. Mirrors the contract's checks 4 and 5 in order. */
export function validateTiming(d: Draft, nowSec: number): Errors {
  const e: Errors = {};
  const sub = localInputToUnix(d.submissionEnd);
  const start = localInputToUnix(d.votingStart);
  const end = localInputToUnix(d.votingEnd);
  if (sub === null) e.submissionEnd = "Pick when entries close.";
  if (start === null) e.votingStart = "Pick when voting opens.";
  if (end === null) e.votingEnd = "Pick when voting closes.";
  if (sub === null || start === null || end === null) return e;

  if (sub <= nowSec) e.submissionEnd = "Entries have to close in the future.";
  else if (start < sub) e.votingStart = "Voting can't open before entries close.";
  if (!e.votingStart && start <= nowSec) e.votingStart = "Voting has to open in the future.";
  if (end <= start) e.votingEnd = "Voting has to close after it opens.";
  else if (end > nowSec + LIMITS.maxLeadSeconds) e.votingEnd = "Voting has to close within 60 days from now.";
  else if (end - start < LIMITS.minVotingSeconds) e.votingEnd = "Voting must stay open for at least 5 minutes.";
  else if (end - start > LIMITS.maxVotingSeconds) {
    e.votingEnd = `Voting can stay open for at most 7 days (this is ${duration(end - start)}).`;
  }
  return e;
}

export type EthParse = { ok: true; wei: bigint } | { ok: false; reason: "empty" | "format" };

export function parseEthInput(text: string): EthParse {
  const t = text.trim();
  if (t === "") return { ok: false, reason: "empty" };
  const m = /^(\d*)(?:\.(\d*))?$/.exec(t);
  if (!m || (m[1] === "" && (m[2] ?? "") === "") || (m[2] ?? "").length > 18) return { ok: false, reason: "format" };
  return { ok: true, wei: parseEther(`${m[1] || "0"}.${m[2] || "0"}`) };
}

export function parseGuestList(d: Draft): TicketParse | null {
  return d.guestListOn ? parseTicketList(d.guestListText) : null;
}

export function validateVoters(d: Draft): Errors {
  const e: Errors = {};
  if (d.guestListOn) {
    const list = parseTicketList(d.guestListText);
    if (list.invalid.length > 0) {
      e.guestList = `${list.invalid.length} ${list.invalid.length === 1 ? "line isn't" : "lines aren't"} a wallet address. Fix or remove ${list.invalid.length === 1 ? "it" : "them"}.`;
    } else if (list.error === "too-many") {
      e.guestList = `A guest list can hold ${MAX_TICKETS.toLocaleString()} wallets at most (this has ${list.addresses.length.toLocaleString()}).`;
    } else if (list.addresses.length === 0) {
      e.guestList = "Add at least one wallet address, or turn the guest list off.";
    }
  }
  if (d.presence === "Gated") {
    const drip = parseEthInput(d.dripEth);
    if (!drip.ok) e.dripEth = "Enter an amount like 0.003 (or 0 for none).";
    else if (drip.wei > LIMITS.maxDripWei) e.dripEth = "The check-in gas gift can be 0.01 at most.";
  }
  return e;
}

export function validatePrize(d: Draft): Errors {
  const e: Errors = {};
  const prize = parseEthInput(d.prizeEth);
  if (!prize.ok) e.prizeEth = "Enter an amount like 0.05, or 0 for no prize.";
  return e;
}

export function validateStep(step: number, d: Draft, nowSec: number): Errors {
  switch (STEPS[step]?.id) {
    case "basics":
      return validateBasics(d);
    case "timing":
      return validateTiming(d, nowSec);
    case "voters":
      return validateVoters(d);
    case "prize":
      return validatePrize(d);
    default:
      return {};
  }
}

/** First step with a problem, or -1. */
export function firstInvalidStep(d: Draft, nowSec: number): number {
  return STEPS.findIndex((_, i) => Object.keys(validateStep(i, d, nowSec)).length > 0);
}

// ---- contract args ----

export type CreateArgs = {
  title: string;
  metadataURI: string;
  submissionEnd: bigint;
  votingStart: bigint;
  votingEnd: bigint;
  presence: 0 | 1 | 2;
  openSubmissions: boolean;
  ticketRoot: Hex;
  ticketListURI: string;
  dripPerCheckIn: bigint;
};

export function presenceIndex(p: Presence): 0 | 1 | 2 {
  return PRESENCE.indexOf(p) as 0 | 1 | 2;
}

/** Drip is 0 unless Gated: the contract rejects anything else. */
export function dripFor(d: Draft): bigint {
  if (d.presence !== "Gated") return 0n;
  const p = parseEthInput(d.dripEth);
  return p.ok ? p.wei : 0n;
}

export function prizeFor(d: Draft): bigint {
  const p = parseEthInput(d.prizeEth);
  return p.ok ? p.wei : 0n;
}

export function buildCreateArgs(
  d: Draft,
  uris: { metadataURI: string; ticketRoot?: Hex; ticketListURI?: string },
): CreateArgs {
  return {
    title: d.title.trim(),
    metadataURI: uris.metadataURI,
    submissionEnd: BigInt(localInputToUnix(d.submissionEnd) ?? 0),
    votingStart: BigInt(localInputToUnix(d.votingStart) ?? 0),
    votingEnd: BigInt(localInputToUnix(d.votingEnd) ?? 0),
    presence: presenceIndex(d.presence),
    openSubmissions: d.openSubmissions,
    ticketRoot: uris.ticketRoot ?? zeroHash,
    ticketListURI: uris.ticketListURI ?? "",
    dripPerCheckIn: dripFor(d),
  };
}

/** What every step component receives. `errors` holds only the messages that should be visible now. */
export type StepProps = {
  draft: Draft;
  set: (patch: Partial<Draft>) => void;
  errors: Errors;
  /** Mark a field as visited so its error can show (validation on blur). */
  blur: (field: keyof Errors) => void;
  /** Chain time, unix seconds. */
  now: number;
};
