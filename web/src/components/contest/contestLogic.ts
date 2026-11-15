import type { Address, Hex } from "viem";
import type { BadgeTone } from "@/components/ui/Badge";
import { assignEntryColours, OTHER_ENTRY_ID, type EntryColour } from "@/lib/hemicycle";
import type { Phase } from "@/lib/phase";

/** Pure rules behind the contest page. No React, no wagmi: everything here is unit tested. */

export const PRESENCE_ANYWHERE = 0;
export const PRESENCE_ROOM = 1;
export const PRESENCE_GATED = 2;

/** Anywhere contests ignore the beacon; the contract still wants the struct (zeros). */
export const NO_BEACON = { slot: 0, token: "0x00000000000000000000000000000000" } as const satisfies {
  slot: number;
  token: Hex;
};

export type VerificationBadge = { label: string; tone: BadgeTone; description: string };

/** How a contest proves its voters were there. */
export function verificationOf(presence: number): VerificationBadge {
  switch (presence) {
    case PRESENCE_ROOM:
      return {
        label: "Room-verified",
        tone: "verified",
        description: "Votes count only from phones that can hear the room signal.",
      };
    case PRESENCE_GATED:
      return {
        label: "Door + Room verified",
        tone: "verified",
        description: "Voters check in at the door, then vote from inside the room.",
      };
    default:
      return { label: "Anywhere", tone: "neutral", description: "Anyone with the link can vote from anywhere." };
  }
}

type EntryLike = {
  id: number;
  votes: number;
  removed: boolean;
  payee: Address;
  submitter: Address;
  members: readonly Address[];
};

const same = (a: string | undefined, b: string | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/**
 * docs/contracts.md "Who may vote for an entry": payee, members and submitter are banned, except
 * that the organiser is never banned as submitter (curated contests: the organiser submits all).
 */
export function isOwnEntry(entry: Pick<EntryLike, "payee" | "submitter" | "members">, account: string | undefined, organiser: string): boolean {
  if (!account) return false;
  if (same(entry.payee, account)) return true;
  if (entry.members.some((m) => same(m, account))) return true;
  return same(entry.submitter, account) && !same(account, organiser);
}

/** Display name: the metadata name once it has loaded, otherwise a stable "Entry 3". */
export function entryName(entry: { id: number; metadata: { name: string }; metadataStatus: string }): string {
  return entry.metadataStatus === "ready" ? entry.metadata.name : `Entry ${entry.id}`;
}

/** Entries still in the contest, in id order. */
export function liveEntries<E extends Pick<EntryLike, "removed" | "id">>(entries: readonly E[]): E[] {
  return entries.filter((e) => !e.removed).sort((a, b) => a.id - b.id);
}

export type Ranked<E> = E & { rank: number };

/** Most votes first, ties by id; tied entries share a rank (1, 1, 3). */
export function rankEntries<E extends Pick<EntryLike, "removed" | "id" | "votes">>(entries: readonly E[]): Ranked<E>[] {
  const sorted = liveEntries(entries).sort((a, b) => b.votes - a.votes || a.id - b.id);
  let rank = 0;
  return sorted.map((e, i) => {
    if (i === 0 || e.votes !== sorted[i - 1]!.votes) rank = i + 1;
    return { ...e, rank };
  });
}

/** Same rule as `finalize`: every live entry with the top count wins, if that count is above zero. */
export function winnersOf(entries: readonly Pick<EntryLike, "removed" | "id" | "votes">[]): number[] {
  const live = liveEntries(entries);
  const top = Math.max(0, ...live.map((e) => e.votes));
  return top === 0 ? [] : live.filter((e) => e.votes === top).map((e) => e.id);
}

/** Per-winner prize, as the contract splits it (remainder goes back to the organiser). */
export function shareOf(prize: bigint, winners: number): bigint {
  return winners > 0 ? prize / BigInt(winners) : 0n;
}

/**
 * Entry colours (design-system §2.3) and the counts the Hemicycle draws. With more than 8 live
 * entries everything outside the top 7 is folded into the "Others" wedge.
 */
export function resultsModel(
  entries: readonly Pick<EntryLike, "removed" | "id" | "votes">[],
  previous?: ReadonlyMap<number, EntryColour>,
): { colours: Map<number, EntryColour>; counts: { entryId: number; votes: number }[]; total: number } {
  const live = liveEntries(entries).map((e) => ({ entryId: e.id, votes: e.votes }));
  const colours = assignEntryColours(live, previous);
  let others = 0;
  const counts: { entryId: number; votes: number }[] = [];
  for (const e of live) {
    if (colours.get(e.entryId) === "other") others += e.votes;
    else counts.push(e);
  }
  if (others > 0) counts.push({ entryId: OTHER_ENTRY_ID, votes: others });
  colours.set(OTHER_ENTRY_ID, "other");
  return { colours, counts, total: live.reduce((a, e) => a + e.votes, 0) };
}

/** `resultsModel` that remembers its last colour assignment, so colours stay sticky across updates. */
export function createResultsMemory() {
  let last: ReadonlyMap<number, EntryColour> | undefined;
  return (entries: readonly Pick<EntryLike, "removed" | "id" | "votes">[]) => {
    const model = resultsModel(entries, last);
    last = model.colours;
    return model;
  };
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export type VoteGate = {
  phase: Phase | undefined;
  presence: number;
  /** Room/Gated proof is ready (always true for Anywhere). */
  presenceReady: boolean;
  /** Gated: the door check-in has landed. Unknown → `presenceReady` decides alone. */
  checkedIn?: boolean;
  /** The phone is listening for the room right now (the room reason reads "Listening for the room…"). */
  listening?: boolean;
  votedEntryId: number;
  ownEntry: boolean;
  removed: boolean;
  ticket: { hasList: boolean; loading: boolean; onList: boolean; failed: boolean };
  connected: boolean;
};

/**
 * Why the vote button can't be used right now, in plain words; `null` when it can.
 * Mirrors the contract's check order, so the reason shown is the one the contract would give.
 * A disconnected wallet is not a reason: the button itself offers "Connect".
 */
export function voteBlockReason(g: VoteGate): string | null {
  if (!g.phase) return "Loading the contest…";
  if (g.phase === "submissions" || g.phase === "upcoming") return "Voting hasn't opened yet.";
  if (g.phase !== "voting") return "Voting has ended for this contest.";
  if (g.removed) return "That entry isn't in this contest anymore.";
  if (!g.connected) return null;
  if (g.votedEntryId !== 0) return "You've already voted in this contest.";
  if (g.ownEntry) return "You can't vote for your own team's entry.";
  if (g.presence === PRESENCE_GATED && !g.presenceReady && g.checkedIn !== true) {
    return "Check in at the door, then join the room to vote.";
  }
  if (g.ticket.hasList && g.presence !== PRESENCE_GATED) {
    if (g.ticket.loading) return "Checking the guest list…";
    if (g.ticket.failed) return "The guest list couldn't be loaded. Try again in a moment.";
    if (!g.ticket.onList) return "This wallet isn't on the guest list.";
  }
  if ((g.presence === PRESENCE_ROOM || g.presence === PRESENCE_GATED) && !g.presenceReady) {
    return g.listening ? "Listening for the room…" : "Join the room to vote.";
  }
  return null;
}

/** Arguments for `vote(contestId, entryId, beacon, ticketProof)`. */
export function voteArgs(
  contestId: bigint,
  entryId: number,
  proof: readonly Hex[] | null,
  beacon: { slot: number; token: Hex } = NO_BEACON,
) {
  return [contestId, entryId, beacon, proof ?? []] as const;
}

/** True when a read failed because the contest id doesn't exist (custom error `ContestNotFound`). */
export function isContestNotFound(err: unknown): boolean {
  let cur: unknown = err;
  for (let i = 0; i < 10 && cur && typeof cur === "object"; i++) {
    const data = (cur as { data?: { errorName?: unknown } }).data;
    if (data && typeof data === "object" && data.errorName === "ContestNotFound") return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

/** ETH string → number and decimal places for NumberTicker ("0.05" → 0.05, 2). */
export function tickerParts(eth: string): { value: number; decimals: number } {
  const clean = eth.replace(/^</, "");
  const decimals = clean.includes(".") ? clean.split(".")[1]!.length : 0;
  return { value: Number(clean), decimals };
}

/** Contest ids in URLs are positive integers; anything else is a not-found before any chain read. */
export function isContestIdParam(id: string): boolean {
  return /^\d{1,30}$/.test(id) && BigInt(id) > 0n;
}

/** A value the page set for one connected wallet (a vote just sent, the entry being voted for). */
export type ForAccount<T> = { account: string | undefined; value: T };

/** The value only while the same wallet is connected; switching accounts drops it. */
export function forAccount<T>(v: ForAccount<T> | null, account: string | undefined): T | null {
  if (!v || !account || !v.account) return null;
  return v.account.toLowerCase() === account.toLowerCase() ? v.value : null;
}
