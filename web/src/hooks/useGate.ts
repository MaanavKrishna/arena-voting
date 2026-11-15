"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { BaseError, getAddress, type Address, type Hex, type PublicClient, type WalletClient } from "viem";
import { arenaAbi } from "@/generated";
import { explainError } from "@/lib/errors";
import { decodePassQR, verifyPass, type PassFailure, type VerifyTypedDataFn } from "@/lib/pass";
import type { Burner } from "@/lib/burner";
import { useNow } from "./useNow";

// Gate: scan → verify → queue. docs/ground-presence.md "Gate device".
// Everything up to the hook is pure and unit tested; the hook wires it to the camera and the chain.

/** New passes are ignored for this long after a successful check-in. */
export const ACCEPT_COOLDOWN_MS = 1_500;
/** A rejection stays on screen (and scanning pauses) this long, so the camera doesn't strobe red. */
export const REJECT_HOLD_MS = 1_500;
/** The green/red flash; the Gate looks ready again after this. */
export const FLASH_MS = 850;
/** The person just admitted is usually still holding their phone up: ignore their pass quietly. */
export const SAME_VOTER_QUIET_MS = 6_000;
export const BURST_WINDOW_MS = 60_000;
/** More check-ins than this within a minute from one Gate gets flagged for staff. */
export const BURST_LIMIT = 6;
export const LOW_CHECK_INS = 10;
/** Conservative gas for one `checkIn` with a drip and a short ticket proof (measured ≈ 75–95k). */
export const CHECK_IN_GAS = 120_000n;

// ---- verdicts ---------------------------------------------------------------------------------

export type RejectReason =
  | "not-a-pass"
  | "wrong-contest"
  | "expired"
  | "stale"
  | "clock"
  | "invalid"
  | "not-on-list"
  | "list-loading"
  | "already-in";

/** Plain words for the person at the door. */
export const REJECT_COPY: Record<RejectReason, { title: string; hint: string }> = {
  "not-a-pass": { title: "That's not an Arena pass", hint: "Ask them to open their pass on the contest page." },
  "wrong-contest": { title: "Pass is for a different contest", hint: "They need the pass for this contest." },
  expired: { title: "Pass expired", hint: "Ask them to tap “Get a new pass”." },
  stale: { title: "Pass out of date", hint: "Show the live pass, not a screenshot." },
  clock: { title: "Phone clock is off", hint: "Set the phone's time automatically, then try again." },
  invalid: { title: "Pass isn't valid", hint: "Ask them to get a new pass." },
  "not-on-list": { title: "Not on the guest list", hint: "This wallet isn't on the organiser's list." },
  "list-loading": { title: "Guest list still loading", hint: "Try again in a moment." },
  "already-in": { title: "Already checked in", hint: "This wallet is already in." },
};

export type Verdict =
  | { ok: true; voter: Address; proof: Hex[] }
  | { ok: false; reason: RejectReason; voter?: Address };

const FAILURE_REASON: Record<PassFailure, RejectReason> = {
  Malformed: "invalid",
  WrongContest: "wrong-contest",
  IssuedAtTooOld: "expired",
  IssuedAtInFuture: "clock",
  TickOutOfRange: "stale",
  BadTickSignature: "invalid",
  BadWalletSignature: "invalid",
};

export type ScanDeps = {
  chainId: number;
  arena: Address;
  contestId: bigint;
  /** Device clock, unix seconds (the voter's phone ticks on its own clock too). */
  now: bigint;
  verifyTypedData: VerifyTypedDataFn;
  /** Local cache: wallets this Gate already admitted or saw on chain. */
  isKnownCheckedIn: (voter: Address) => boolean;
  /** Chain read; a failed read is treated as "not checked in" (the contract checks again). */
  isCheckedInOnChain: (voter: Address) => Promise<boolean>;
  ticketList: { hasList: boolean; ready: boolean; proofFor: (voter: Address) => Hex[] | null };
};

/** Decides one scanned string. Cheap checks first; the chain read runs alongside signature checks. */
export async function evaluateScan(text: string, d: ScanDeps): Promise<Verdict> {
  const pass = decodePassQR(text);
  if (!pass) return { ok: false, reason: "not-a-pass" };
  const voter = pass.voter;
  if (pass.contestId !== d.contestId) return { ok: false, reason: "wrong-contest", voter };
  if (d.isKnownCheckedIn(voter)) return { ok: false, reason: "already-in", voter };

  const onChain = d.isCheckedInOnChain(voter).catch(() => false);
  const res = await verifyPass(pass, {
    chainId: d.chainId,
    arena: d.arena,
    now: d.now,
    verifyTypedData: d.verifyTypedData,
    expectedContestId: d.contestId,
  });
  if (!res.ok) return { ok: false, reason: FAILURE_REASON[res.reason], voter };

  let proof: Hex[] = [];
  if (d.ticketList.hasList) {
    if (!d.ticketList.ready) return { ok: false, reason: "list-loading", voter };
    const p = d.ticketList.proofFor(voter);
    if (p === null) return { ok: false, reason: "not-on-list", voter };
    proof = p;
  }
  if (await onChain) return { ok: false, reason: "already-in", voter };
  return { ok: true, voter, proof };
}

// ---- state machine ----------------------------------------------------------------------------

export type QueueStatus = "queued" | "sending" | "pending" | "confirmed" | "failed";

export type QueueItem = {
  id: number;
  voter: Address;
  proof: Hex[];
  status: QueueStatus;
  /** ms timestamp of the scan. */
  at: number;
  attempts: number;
  hash?: Hex;
  error?: string;
  /** Set when another Gate got there first: the voter is in, but not by this Gate. */
  note?: string;
};

export type Flash =
  | { kind: "accepted"; voter: Address; at: number }
  | { kind: "rejected"; reason: RejectReason; voter?: Address; at: number };

export type GateState = {
  verifying: boolean;
  flash: Flash | null;
  /** No new scans are taken before this ms timestamp. */
  busyUntil: number;
  /** Lower-cased wallets known to be checked in (admitted here or seen on chain). */
  checkedIn: Record<string, true>;
  /** Lower-cased wallet → ms timestamp of its last check-in here. */
  admittedAt: Record<string, number>;
  /** ms timestamps of recent check-ins, for the burst warning. */
  recent: number[];
  queue: QueueItem[];
  nextId: number;
};

export const initialGate: GateState = {
  verifying: false,
  flash: null,
  busyUntil: 0,
  checkedIn: {},
  admittedAt: {},
  recent: [],
  queue: [],
  nextId: 1,
};

export type GateAction =
  | { type: "scan-start"; at: number }
  | { type: "verdict"; verdict: Verdict; at: number }
  | { type: "flash-clear"; at: number }
  | { type: "known-checked-in"; voter: Address }
  | { type: "tx-sending"; id: number }
  | { type: "tx-sent"; id: number; hash: Hex }
  | { type: "tx-confirmed"; id: number }
  | { type: "tx-failed"; id: number; error: string; alreadyIn?: boolean }
  | { type: "retry"; id: number };

const key = (a: Address) => a.toLowerCase();

function patch(state: GateState, id: number, f: (q: QueueItem) => QueueItem | null): GateState {
  let changed = false;
  const queue = state.queue.map((q) => {
    if (q.id !== id) return q;
    const next = f(q);
    if (!next) return q;
    changed = true;
    return next;
  });
  return changed ? { ...state, queue } : state;
}

export function gateReducer(state: GateState, a: GateAction): GateState {
  switch (a.type) {
    case "scan-start":
      if (!canScan(state, a.at)) return state;
      return { ...state, verifying: true };

    case "verdict": {
      const v = a.verdict;
      // A pass that turns out fine but whose wallet we already admitted is a duplicate.
      if (v.ok && state.checkedIn[key(v.voter)]) {
        return gateReducer(state, { type: "verdict", verdict: { ok: false, reason: "already-in", voter: v.voter }, at: a.at });
      }
      if (v.ok) {
        const id = state.nextId;
        return {
          ...state,
          verifying: false,
          flash: { kind: "accepted", voter: v.voter, at: a.at },
          busyUntil: a.at + ACCEPT_COOLDOWN_MS,
          checkedIn: { ...state.checkedIn, [key(v.voter)]: true },
          admittedAt: { ...state.admittedAt, [key(v.voter)]: a.at },
          recent: [...state.recent.filter((t) => a.at - t < BURST_WINDOW_MS), a.at],
          queue: [...state.queue, { id, voter: v.voter, proof: v.proof, status: "queued", at: a.at, attempts: 0 }],
          nextId: id + 1,
        };
      }
      return {
        ...state,
        verifying: false,
        flash: { kind: "rejected", reason: v.reason, voter: v.voter, at: a.at },
        busyUntil: a.at + REJECT_HOLD_MS,
        checkedIn:
          v.reason === "already-in" && v.voter ? { ...state.checkedIn, [key(v.voter)]: true } : state.checkedIn,
      };
    }

    case "flash-clear":
      if (!state.flash || a.at - state.flash.at < FLASH_MS) return state;
      return { ...state, flash: null };

    case "known-checked-in":
      if (state.checkedIn[key(a.voter)]) return state;
      return { ...state, checkedIn: { ...state.checkedIn, [key(a.voter)]: true } };

    case "tx-sending":
      return patch(state, a.id, (q) =>
        q.status === "queued" ? { ...q, status: "sending", attempts: q.attempts + 1, error: undefined } : null,
      );

    case "tx-sent":
      return patch(state, a.id, (q) => (q.status === "sending" ? { ...q, status: "pending", hash: a.hash } : null));

    case "tx-confirmed":
      return patch(state, a.id, (q) => ({ ...q, status: "confirmed", error: undefined }));

    case "tx-failed":
      return patch(state, a.id, (q) =>
        a.alreadyIn
          ? { ...q, status: "confirmed", error: undefined, note: "Already checked in at another gate" }
          : { ...q, status: "failed", error: a.error },
      );

    case "retry":
      return patch(state, a.id, (q) => (q.status === "failed" ? { ...q, status: "queued", error: undefined } : null));
  }
}

/** True when the Gate will take a new scan right now. */
export function canScan(state: GateState, now: number): boolean {
  return !state.verifying && now >= state.busyUntil;
}

/** The pass of someone admitted a moment ago: ignore it silently instead of flashing "already in". */
export function isQuietRepeat(state: GateState, voter: Address, now: number): boolean {
  const t = state.admittedAt[key(voter)];
  return t !== undefined && now - t < SAME_VOTER_QUIET_MS;
}

/** The next queued check-in to send, or null while one is being sent (sends go one at a time). */
export function nextToSend(state: GateState): QueueItem | null {
  if (state.queue.some((q) => q.status === "sending")) return null;
  return state.queue.find((q) => q.status === "queued") ?? null;
}

export function burstCount(state: GateState, now: number): number {
  return state.recent.filter((t) => now - t < BURST_WINDOW_MS).length;
}

export function isBurst(state: GateState, now: number): boolean {
  return burstCount(state, now) > BURST_LIMIT;
}

export function queueCounts(state: GateState) {
  const c = { waiting: 0, confirmed: 0, failed: 0 };
  for (const q of state.queue) {
    if (q.status === "confirmed") c.confirmed++;
    else if (q.status === "failed") c.failed++;
    else c.waiting++;
  }
  return c;
}

/**
 * Check-ins the balance still covers: each one forwards `drip` to the voter plus pays for gas.
 * `null` until both the balance and the gas price are known.
 */
export function checkInsLeft(
  balance: bigint | undefined,
  drip: bigint,
  gasPrice: bigint | undefined,
  gas: bigint = CHECK_IN_GAS,
): number | null {
  if (balance === undefined || gasPrice === undefined) return null;
  const each = drip + gas * gasPrice;
  if (each === 0n) return null;
  return Number(balance / each);
}

/** Name of the contract's custom error inside a viem error, if any. */
export function revertName(err: unknown): string | undefined {
  let name: string | undefined;
  const visit = (e: unknown) => {
    const data = (e as { data?: { errorName?: unknown } } | null)?.data;
    if (!name && data && typeof data.errorName === "string") name = data.errorName;
  };
  if (err instanceof BaseError) {
    err.walk((e) => {
      visit(e);
      return false;
    });
  } else visit(err);
  return name;
}

/** Queue failure copy from the Gate's point of view (the burner pays, not the voter). */
export function gateErrorCopy(err: unknown): string {
  const name = revertName(err);
  if (name === "NotGatekeeper") return "This gate isn't authorised anymore. Ask the organiser.";
  if (name === "VotingEnded") return "Voting has ended, so check-in is closed.";
  if (name === "NotOnTicketList") return "Not on the guest list.";
  let funds = false;
  const look = (e: unknown) => {
    const o = e as { name?: unknown; shortMessage?: unknown; message?: unknown } | null;
    if (!o) return;
    if (o.name === "InsufficientFundsError") funds = true;
    for (const t of [o.shortMessage, o.message]) if (typeof t === "string" && /insufficient funds/i.test(t)) funds = true;
  };
  if (err instanceof BaseError) err.walk((e) => (look(e), false));
  else look(err);
  if (funds) return "This gate is out of funds. Fund it, then retry.";
  return explainError(err).title;
}

// ---- hook -------------------------------------------------------------------------------------

export type UseGateOptions = {
  /** False until the Gate is authorised, the contest loaded and the burner ready. */
  enabled: boolean;
  contestId: bigint;
  chainId: number;
  arena: Address | undefined;
  drip: bigint;
  publicClient: PublicClient | undefined;
  walletClient: WalletClient | null;
  burner: Burner | null;
  ticketList: ScanDeps["ticketList"];
  /** Called on the same frame as the flash, for sound and haptics. */
  onResult?: (verdict: Verdict) => void;
};

export function useGate(o: UseGateOptions) {
  const [state, dispatch] = useReducer(gateReducer, initialGate);
  const stateRef = useRef(state);
  const optsRef = useRef(o);
  useEffect(() => {
    stateRef.current = state;
    optsRef.current = o;
  });

  const verifyTypedData = useMemo<VerifyTypedDataFn | undefined>(() => {
    const client = o.publicClient;
    // A public client's verifyTypedData also handles contract wallets (ERC-1271 / ERC-6492).
    return client ? (args) => client.verifyTypedData(args) : undefined;
  }, [o.publicClient]);

  const onScan = useCallback(
    async (text: string) => {
      const opts = optsRef.current;
      const now = Date.now();
      if (!opts.enabled || !opts.arena || !opts.publicClient || !verifyTypedData) return;
      const s = stateRef.current;
      if (!canScan(s, now)) return;
      const peek = decodePassQR(text);
      if (peek && isQuietRepeat(s, peek.voter, now)) return;

      // Mark busy synchronously so a burst of camera frames doesn't verify the same pass twice.
      stateRef.current = { ...s, verifying: true };
      dispatch({ type: "scan-start", at: now });
      const client = opts.publicClient;
      const arena = opts.arena;
      let verdict: Verdict;
      try {
        verdict = await evaluateScan(text, {
          chainId: opts.chainId,
          arena,
          contestId: opts.contestId,
          now: BigInt(Math.floor(now / 1000)),
          verifyTypedData,
          isKnownCheckedIn: (v) => !!stateRef.current.checkedIn[key(v)],
          isCheckedInOnChain: (v) =>
            client.readContract({ address: arena, abi: arenaAbi, functionName: "checkedIn", args: [opts.contestId, v] }),
          ticketList: opts.ticketList,
        });
      } catch {
        verdict = { ok: false, reason: "invalid" };
      }
      const at = Date.now();
      dispatch({ type: "verdict", verdict, at });
      opts.onResult?.(verdict);
    },
    [verifyTypedData],
  );

  // Let the flash go after FLASH_MS; the Gate reads "ready" again well inside a second.
  useEffect(() => {
    if (!state.flash) return;
    const wait = Math.max(0, state.flash.at + FLASH_MS - Date.now());
    const t = setTimeout(() => dispatch({ type: "flash-clear", at: Date.now() }), wait);
    return () => clearTimeout(t);
  }, [state.flash]);

  // The send loop: one at a time (nonce order), never waiting for a confirmation before the next.
  const next = nextToSend(state);
  const started = useRef(new Set<string>());
  useEffect(() => {
    if (!next) return;
    const { walletClient, publicClient, burner, arena, contestId, drip } = optsRef.current;
    if (!walletClient || !publicClient || !burner || !arena) return;
    const item = next;
    const attempt = `${item.id}:${item.attempts}`;
    if (started.current.has(attempt)) return;
    started.current.add(attempt);
    dispatch({ type: "tx-sending", id: item.id });
    void (async () => {
      try {
        const { request } = await publicClient.simulateContract({
          account: burner.account,
          address: arena,
          abi: arenaAbi,
          functionName: "checkIn",
          args: [contestId, getAddress(item.voter), item.proof],
          value: drip,
        });
        const hash = await walletClient.writeContract(request);
        dispatch({ type: "tx-sent", id: item.id, hash });
        publicClient
          .waitForTransactionReceipt({ hash })
          .then((r) =>
            dispatch(
              r.status === "success"
                ? { type: "tx-confirmed", id: item.id }
                : { type: "tx-failed", id: item.id, error: "The network turned it down. Try again." },
            ),
          )
          .catch((err: unknown) => dispatch({ type: "tx-failed", id: item.id, error: gateErrorCopy(err) }));
      } catch (err) {
        dispatch({
          type: "tx-failed",
          id: item.id,
          error: gateErrorCopy(err),
          alreadyIn: revertName(err) === "AlreadyCheckedIn",
        });
      }
    })();
  }, [next]);

  const retry = useCallback((id: number) => dispatch({ type: "retry", id }), []);
  const nowMs = Number(useNow()) * 1000;

  return {
    state,
    onScan,
    retry,
    /** Ready for the next person (the 1.5 s cooldown keeps running quietly behind this). */
    ready: o.enabled && !state.verifying && !state.flash,
    burst: nowMs > 0 && isBurst(state, nowMs),
    burstCount: nowMs > 0 ? burstCount(state, nowMs) : 0,
    counts: queueCounts(state),
  };
}
