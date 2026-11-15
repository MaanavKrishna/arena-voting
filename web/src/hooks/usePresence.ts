"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import type { Hex } from "viem";
import { env } from "@/config/env";
import { arenaAbi } from "@/generated";
import { decodePayload, QR_PREFIX } from "@/lib/beacon/payload";
import { isSoundSupported, startReceive, type ReceiveHandle } from "@/lib/beacon/sound";
import { useArena } from "./useArena";

/*
 * Presence on the phone (docs/frontend.md "Presence state machine", docs/ground-presence.md "Timing").
 *
 *   idle ─Listen─► requesting-mic ─granted─► listening ─token─► validating ─ok─► in-room ✓
 *                        │denied                 │15 s, no token                   │ keeps listening,
 *                        ▼                       ▼                                 │ swaps to newer tokens
 *                   mic-denied (QR)          offer-qr (still listening)            │60 s without a newer one
 *                                                                                  ▼
 *                                                                   stale (listening again) ─15 s─► offer-qr
 *   paused: the browser suspended the mic (iOS tab hidden / screen locked) → "Tap to listen again".
 *
 * The reducer is pure: every time it needs comes in on the action (performance.now()), so the
 * phone never depends on its wall clock. Tokens are kept by slot: only a strictly newer slot
 * replaces the current one, and a token's age runs from the moment that slot was first heard.
 */

/** A token is stale after this long without a newer one (performance.now age). */
export const STALE_AFTER_MS = 60_000;
/** Offer the QR fallback after this long listening with no token. */
export const OFFER_QR_AFTER_MS = 15_000;

export type PresenceStatus =
  "idle" | "requesting-mic" | "listening" | "offer-qr" | "mic-denied" | "validating" | "in-room" | "stale" | "paused";

export type MicState = "off" | "requesting" | "on" | "paused" | "denied";
export type TokenSource = "sound" | "qr" | "e2e";
export type HeardToken = {
  slot: number;
  token: Hex;
  receivedAt: number;
  source: TokenSource;
};
/** Why a heard token didn't count. */
export type RejectReason = "expired" | "not-set" | "invalid" | "network";
/** Why the mic isn't available. */
export type MicProblem = "denied" | "unsupported" | "insecure" | "failed";

export type PresenceState = {
  status: PresenceStatus;
  mic: MicState;
  micProblem: MicProblem | null;
  /** Newest validated token. */
  token: HeardToken | null;
  /** Newer token waiting for its on-chain check. */
  candidate: HeardToken | null;
  /** performance.now() when the current listening stretch began (resets on stale). */
  listenSince: number | null;
  qrOffered: boolean;
  /** The last valid token aged out or failed the pre-vote check. */
  lost: boolean;
  rejected: RejectReason | null;
  /** Slot of the last refused token, so the same slot repeating isn't checked again. */
  rejectedSlot: number | null;
  /** Counts accepted heard tokens (drives the orb ripple). */
  pulse: number;
  /** Last performance.now() the reducer saw. */
  now: number;
};

export type PresenceAction =
  | { type: "listen" }
  | { type: "mic-granted"; at: number }
  | { type: "mic-denied"; problem: MicProblem }
  | { type: "mic-paused" }
  | { type: "mic-resumed"; at: number }
  | { type: "heard"; token: HeardToken }
  | { type: "validated"; slot: number; token: Hex }
  | { type: "rejected"; slot: number; token: Hex; reason: RejectReason }
  | { type: "invalidate"; at: number }
  | { type: "tick"; now: number }
  | { type: "stop" };

export const initialPresence: PresenceState = {
  status: "idle",
  mic: "off",
  micProblem: null,
  token: null,
  candidate: null,
  listenSince: null,
  qrOffered: false,
  lost: false,
  rejected: null,
  rejectedSlot: null,
  pulse: 0,
  now: 0,
};

/** The visible state follows from the facts, in priority order. */
export function deriveStatus(s: Omit<PresenceState, "status">): PresenceStatus {
  if (s.mic === "requesting") return "requesting-mic";
  if (s.mic === "paused") return "paused";
  if (s.token) return "in-room";
  if (s.candidate) return "validating";
  if (s.mic === "denied") return "mic-denied";
  if (s.qrOffered) return "offer-qr";
  if (s.lost) return "stale";
  if (s.mic === "on") return "listening";
  return "idle";
}

const settle = (s: Omit<PresenceState, "status"> & { status?: PresenceStatus }): PresenceState => ({
  ...s,
  status: deriveStatus(s),
});

const same = (a: { slot: number; token: Hex } | null, slot: number, token: Hex) =>
  !!a && a.slot === slot && a.token.toLowerCase() === token.toLowerCase();

export function presenceReducer(state: PresenceState, action: PresenceAction): PresenceState {
  switch (action.type) {
    case "listen":
      return settle({ ...state, mic: "requesting", micProblem: null });
    case "mic-granted":
      return settle({
        ...state,
        mic: "on",
        listenSince: action.at,
        qrOffered: false,
        now: Math.max(state.now, action.at),
      });
    case "mic-denied":
      return settle({
        ...state,
        mic: "denied",
        micProblem: action.problem,
        listenSince: null,
        qrOffered: false,
      });
    case "mic-paused":
      return state.mic === "on" ? settle({ ...state, mic: "paused" }) : state;
    case "mic-resumed":
      return state.mic === "paused" || state.mic === "requesting"
        ? settle({
            ...state,
            mic: "on",
            listenSince: action.at,
            qrOffered: false,
          })
        : state;
    case "heard": {
      const t = action.token;
      const newest =
        state.candidate && (!state.token || state.candidate.slot > state.token.slot) ? state.candidate : state.token;
      if (newest && t.slot <= newest.slot) return state; // same slot repeating, or an older one
      if (state.rejectedSlot !== null && t.slot <= state.rejectedSlot) return state; // already refused
      return settle({
        ...state,
        candidate: t,
        rejected: null,
        pulse: state.pulse + 1,
        now: Math.max(state.now, t.receivedAt),
      });
    }
    case "validated": {
      if (!same(state.candidate, action.slot, action.token)) return state;
      return settle({
        ...state,
        token: state.candidate,
        candidate: null,
        lost: false,
        qrOffered: false,
        rejected: null,
      });
    }
    case "rejected": {
      if (!same(state.candidate, action.slot, action.token)) return state;
      return settle({
        ...state,
        candidate: null,
        rejected: action.reason,
        rejectedSlot: action.slot,
      });
    }
    case "invalidate":
      if (!state.token) return state;
      return settle({
        ...state,
        token: null,
        lost: true,
        qrOffered: false,
        listenSince: state.mic === "on" ? action.at : state.listenSince,
        now: Math.max(state.now, action.at),
      });
    case "tick": {
      const now = action.now;
      let next: Omit<PresenceState, "status"> = { ...state, now };
      if (next.token && now - next.token.receivedAt >= STALE_AFTER_MS) {
        next = {
          ...next,
          token: null,
          lost: true,
          qrOffered: false,
          listenSince: next.mic === "on" ? now : next.listenSince,
        };
      }
      if (
        next.mic === "on" &&
        !next.token &&
        !next.candidate &&
        !next.qrOffered &&
        next.listenSince !== null &&
        now - next.listenSince >= OFFER_QR_AFTER_MS
      ) {
        next = { ...next, qrOffered: true, lost: false };
      }
      return settle(next);
    }
    case "stop":
      return { ...initialPresence, pulse: state.pulse, now: state.now };
  }
}

/** Age of the current token in ms (null without one). */
export function tokenAge(state: PresenceState): number | null {
  return state.token ? Math.max(0, state.now - state.token.receivedAt) : null;
}

/** `beaconStatus` enum (docs/contracts.md) → why a token didn't count. */
export function rejectReasonOf(status: number): RejectReason | null {
  switch (status) {
    case 0:
      return null; // Ok
    case 1:
      return "not-set";
    case 2:
    case 3:
      return "expired"; // SlotOutOfRange, Expired
    default:
      return "invalid"; // GapTooLarge, Invalid
  }
}

/** Plain-English copy for a refused token. */
export function rejectCopy(reason: RejectReason, listening = true): string {
  switch (reason) {
    case "expired":
      return listening
        ? "That signal is too old. Listening for a fresh one…"
        : "That signal is too old. Try a fresh one.";
    case "not-set":
      return "The organiser hasn't started the room signal yet.";
    case "invalid":
      return "That signal isn't from this room.";
    case "network":
      return listening
        ? "We couldn't check the signal. Trying again with the next one."
        : "We couldn't check the signal. Try again.";
  }
}

const BEACON_ERRORS = new Set(["BeaconExpired", "InvalidBeaconToken", "BeaconGapTooLarge", "BeaconSlotOutOfRange"]);

/** True when a vote failed because its beacon token was no longer good (walks viem's cause chain). */
export function isBeaconRevert(err: unknown): boolean {
  let cur: unknown = err;
  for (let i = 0; i < 10 && cur && typeof cur === "object"; i++) {
    const data = (cur as { data?: { errorName?: unknown } }).data;
    if (data && typeof data === "object" && typeof data.errorName === "string" && BEACON_ERRORS.has(data.errorName)) {
      return true;
    }
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

function micProblemOf(err: unknown): MicProblem {
  const name = err && typeof err === "object" && "name" in err ? String((err as { name: unknown }).name) : "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "denied";
  if (name === "NotFoundError" || name === "NotReadableError" || name === "OverconstrainedError") return "unsupported";
  if (typeof window !== "undefined" && !window.isSecureContext) return "insecure";
  return "failed";
}

declare global {
  interface Window {
    /** E2E only (NEXT_PUBLIC_E2E): feed a payload as if the sound worker had decoded it. */
    __arenaInjectBeacon?: (payloadHex: string) => boolean;
  }
}

export type BeaconArg = { slot: number; token: Hex };

/**
 * Presence for one Room/Gated contest. Call `listen()` from a tap (the AudioContext and mic
 * prompt need a user gesture). `freshToken()` is the pre-wallet check: newest token, re-validated
 * with `isBeaconTokenValid`; null (and back to listening) if the room signal moved on.
 */
export function usePresence(contestId: bigint, opts: { enabled?: boolean } = {}) {
  const enabled = opts.enabled ?? true;
  const { client, address } = useArena();
  const [state, dispatch] = useReducer(presenceReducer, initialPresence);
  const rx = useRef<ReceiveHandle | null>(null);
  const session = useRef(0);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const handleIncoming = useCallback(
    (input: Uint8Array | string, source: TokenSource): boolean => {
      const p = decodePayload(input);
      if (!p || BigInt(p.contestId) !== contestId) return false; // other contests / versions / junk
      dispatch({
        type: "heard",
        token: {
          slot: p.slot,
          token: p.token,
          receivedAt: performance.now(),
          source,
        },
      });
      return true;
    },
    [contestId],
  );

  const stopReceiver = useCallback(() => {
    session.current += 1;
    const h = rx.current;
    rx.current = null;
    h?.stop();
  }, []);

  const listen = useCallback(() => {
    stopReceiver(); // "Tap to listen again" starts a fresh context inside this tap
    if (!isSoundSupported()) {
      dispatch({ type: "mic-denied", problem: "unsupported" });
      return;
    }
    const id = session.current;
    dispatch({ type: "listen" });
    startReceive({
      onPayload: (bytes) => {
        if (session.current === id) handleIncoming(bytes, "sound");
      },
      onStateChange: (s) => {
        if (session.current !== id) return;
        if (s === "paused") dispatch({ type: "mic-paused" });
        else if (s === "listening") dispatch({ type: "mic-resumed", at: performance.now() });
      },
    }).then(
      (handle) => {
        if (session.current !== id) {
          handle.stop();
          return;
        }
        rx.current = handle;
        dispatch({ type: "mic-granted", at: performance.now() });
      },
      (err: unknown) => {
        if (session.current === id) dispatch({ type: "mic-denied", problem: micProblemOf(err) });
      },
    );
  }, [handleIncoming, stopReceiver]);

  const stop = useCallback(() => {
    stopReceiver();
    dispatch({ type: "stop" });
  }, [stopReceiver]);

  /** A camera read: only `arena:b1:` texts count. Returns whether it was a beacon for this contest. */
  const scanQR = useCallback(
    (text: string) => text.trim().startsWith(QR_PREFIX) && handleIncoming(text, "qr"),
    [handleIncoming],
  );

  // Validate each new candidate on chain (free eth_call). Newer candidates supersede older checks.
  const candidate = state.candidate;
  useEffect(() => {
    if (!candidate || !client || !address) return;
    let cancelled = false;
    const { slot, token } = candidate;
    client
      .readContract({
        address,
        abi: arenaAbi,
        functionName: "beaconStatus",
        args: [contestId, { slot, token }],
      })
      .then(
        (status) => {
          if (cancelled) return;
          const reason = rejectReasonOf(Number(status));
          dispatch(reason ? { type: "rejected", slot, token, reason } : { type: "validated", slot, token });
        },
        () => !cancelled && dispatch({ type: "rejected", slot, token, reason: "network" }),
      );
    return () => {
      cancelled = true;
    };
  }, [candidate, client, address, contestId]);

  // One clock for staleness, the QR offer and the visible age.
  const ticking = state.mic === "on" || state.mic === "paused" || state.token !== null;
  useEffect(() => {
    if (!ticking) return;
    dispatch({ type: "tick", now: performance.now() });
    const t = setInterval(() => dispatch({ type: "tick", now: performance.now() }), 1000);
    return () => clearInterval(t);
  }, [ticking]);

  // Not needed any more (voted, voting closed): let go of the mic.
  useEffect(() => {
    if (!enabled) stop();
  }, [enabled, stop]);

  useEffect(() => () => stopReceiver(), [stopReceiver]);

  // E2E: the same path the sound worker feeds.
  useEffect(() => {
    if (!env.NEXT_PUBLIC_E2E || !enabled) return;
    const inject = (hex: string) => handleIncoming(hex, "e2e");
    window.__arenaInjectBeacon = inject;
    return () => {
      if (window.__arenaInjectBeacon === inject) delete window.__arenaInjectBeacon;
    };
  }, [enabled, handleIncoming]);

  const freshToken = useCallback(async (): Promise<BeaconArg | null> => {
    const s = stateRef.current;
    const newest = s.token;
    if (!newest || !client || !address) return null;
    const arg = { slot: newest.slot, token: newest.token };
    let ok = false;
    try {
      ok = await client.readContract({
        address,
        abi: arenaAbi,
        functionName: "isBeaconTokenValid",
        args: [contestId, arg],
      });
    } catch {
      ok = false;
    }
    if (!ok) {
      dispatch({ type: "invalidate", at: performance.now() });
      return null;
    }
    return arg;
  }, [client, address, contestId]);

  const invalidate = useCallback(() => dispatch({ type: "invalidate", at: performance.now() }), []);

  return {
    state: state.status,
    mic: state.mic,
    micProblem: state.micProblem,
    token: state.token ? { slot: state.token.slot, token: state.token.token } : null,
    inRoom: state.token !== null,
    ageMs: tokenAge(state),
    rejected: state.rejected,
    pulse: state.pulse,
    listen,
    stop,
    scanQR,
    freshToken,
    invalidate,
  };
}

export type Presence = ReturnType<typeof usePresence>;
