import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import {
  OFFER_QR_AFTER_MS,
  STALE_AFTER_MS,
  initialPresence,
  isBeaconRevert,
  presenceReducer,
  rejectReasonOf,
  tokenAge,
  type HeardToken,
  type PresenceAction,
  type PresenceState,
} from "./usePresence";

const tok = (slot: number, receivedAt: number, source: HeardToken["source"] = "sound"): HeardToken => ({
  slot,
  token: `0x${slot.toString(16).padStart(32, "0")}` as Hex,
  receivedAt,
  source,
});

const run = (actions: PresenceAction[], from: PresenceState = initialPresence) => actions.reduce(presenceReducer, from);

/** Listening since t = 1000. */
const listening = () => run([{ type: "listen" }, { type: "mic-granted", at: 1000 }]);

/** In the room with slot 10, heard at t = 2000. */
const inRoom = () => {
  const t = tok(10, 2000);
  return run(
    [
      { type: "heard", token: t },
      { type: "validated", slot: t.slot, token: t.token },
    ],
    listening(),
  );
};

describe("presenceReducer", () => {
  it("idle → requesting-mic on Listen", () => {
    expect(initialPresence.status).toBe("idle");
    expect(run([{ type: "listen" }]).status).toBe("requesting-mic");
  });

  it("requesting-mic → listening when the mic is granted", () => {
    const s = listening();
    expect(s.status).toBe("listening");
    expect(s.mic).toBe("on");
    expect(s.listenSince).toBe(1000);
  });

  it("requesting-mic → mic-denied (offer QR) when refused", () => {
    const s = run([{ type: "listen" }, { type: "mic-denied", problem: "denied" }]);
    expect(s.status).toBe("mic-denied");
    expect(s.micProblem).toBe("denied");
  });

  it("listening → validating on a decoded token, → in-room when the chain says it's valid", () => {
    const t = tok(10, 2000);
    const v = presenceReducer(listening(), { type: "heard", token: t });
    expect(v.status).toBe("validating");
    expect(v.pulse).toBe(1);
    const s = presenceReducer(v, {
      type: "validated",
      slot: 10,
      token: t.token,
    });
    expect(s.status).toBe("in-room");
    expect(s.token).toEqual(t);
  });

  it("a refused token goes back to listening with a reason, and that slot isn't checked again", () => {
    const t = tok(10, 2000);
    const s = run(
      [
        { type: "heard", token: t },
        { type: "rejected", slot: 10, token: t.token, reason: "expired" },
      ],
      listening(),
    );
    expect(s.status).toBe("listening");
    expect(s.rejected).toBe("expired");
    expect(presenceReducer(s, { type: "heard", token: tok(10, 2500) })).toBe(s);
    expect(presenceReducer(s, { type: "heard", token: tok(11, 2500) }).status).toBe("validating");
  });

  it("only the exact refused (slot, token) is skipped: another chain's token for that slot or an earlier one is checked", () => {
    const t = tok(10, 2000);
    const s = run(
      [
        { type: "heard", token: t },
        { type: "rejected", slot: 10, token: t.token, reason: "invalid" },
      ],
      listening(),
    );
    const other: HeardToken = { ...tok(10, 2500), token: `0x${"ab".repeat(16)}` as Hex };
    expect(presenceReducer(s, { type: "heard", token: other }).status).toBe("validating");
    expect(presenceReducer(s, { type: "heard", token: tok(4, 2500) }).status).toBe("validating");
  });

  it("a beacon rotation drops the old chain's token, candidate and refusal, and keeps listening", () => {
    const s = inRoom(); // slot 10
    const refused = run(
      [
        { type: "heard", token: tok(11, 3000) },
        { type: "rejected", slot: 11, token: tok(11, 3000).token, reason: "invalid" },
      ],
      s,
    );
    const r = presenceReducer(refused, { type: "rotated", at: 4000 });
    expect(r.token).toBeNull();
    expect(r.candidate).toBeNull();
    expect(r.rejected).toBeNull();
    expect(r.refused).toBeNull();
    expect(r.mic).toBe("on");
    expect(r.status).toBe("listening");
    expect(r.listenSince).toBe(4000);
    // The new chain's slots can be lower than the old token's.
    const t = tok(3, 5000);
    expect(presenceReducer(r, { type: "heard", token: t }).status).toBe("validating");
  });

  it("Listen again forgets an earlier refusal", () => {
    const t = tok(10, 2000);
    const s = run(
      [
        { type: "heard", token: t },
        { type: "rejected", slot: 10, token: t.token, reason: "network" },
        { type: "listen" },
        { type: "mic-granted", at: 3000 },
      ],
      listening(),
    );
    expect(s.refused).toBeNull();
    expect(s.rejected).toBeNull();
    expect(presenceReducer(s, { type: "heard", token: tok(10, 3500) }).status).toBe("validating");
  });

  it("listening → offer-qr after 15 s with no token (still listening)", () => {
    const s = listening();
    expect(presenceReducer(s, { type: "tick", now: 1000 + OFFER_QR_AFTER_MS - 1 }).status).toBe("listening");
    const q = presenceReducer(s, {
      type: "tick",
      now: 1000 + OFFER_QR_AFTER_MS,
    });
    expect(q.status).toBe("offer-qr");
    expect(q.mic).toBe("on");
    // a token still gets you in
    const t = tok(3, 20_000);
    const r = run(
      [
        { type: "heard", token: t },
        { type: "validated", slot: 3, token: t.token },
      ],
      q,
    );
    expect(r.status).toBe("in-room");
    expect(r.qrOffered).toBe(false);
  });

  it("in-room keeps listening and swaps to newer tokens; ignores repeats and older slots", () => {
    const s = inRoom();
    const repeat = presenceReducer(s, { type: "heard", token: tok(10, 9000) });
    expect(repeat).toBe(s); // same slot repeating: age keeps running from the first time it was heard
    expect(presenceReducer(s, { type: "heard", token: tok(9, 9000) })).toBe(s);

    const newer = tok(11, 12_000);
    const v = presenceReducer(s, { type: "heard", token: newer });
    expect(v.status).toBe("in-room"); // still in the room while the newer one is checked
    expect(v.token?.slot).toBe(10);
    const swapped = presenceReducer(v, {
      type: "validated",
      slot: 11,
      token: newer.token,
    });
    expect(swapped.status).toBe("in-room");
    expect(swapped.token).toEqual(newer);
    expect(tokenAge(presenceReducer(swapped, { type: "tick", now: 15_000 }))).toBe(3000);
  });

  it("a newer token heard while one is being checked supersedes it", () => {
    const a = tok(5, 2000);
    const b = tok(6, 3000);
    const s = run(
      [
        { type: "heard", token: a },
        { type: "heard", token: b },
      ],
      listening(),
    );
    expect(s.candidate).toEqual(b);
    expect(presenceReducer(s, { type: "validated", slot: 5, token: a.token })).toBe(s); // stale result dropped
    expect(presenceReducer(s, { type: "validated", slot: 6, token: b.token }).token).toEqual(b);
  });

  it("in-room → stale after 60 s without a newer token (performance.now age), then offer-qr 15 s later", () => {
    const s = inRoom(); // heard at 2000
    expect(presenceReducer(s, { type: "tick", now: 2000 + STALE_AFTER_MS - 1 }).status).toBe("in-room");
    const stale = presenceReducer(s, {
      type: "tick",
      now: 2000 + STALE_AFTER_MS,
    });
    expect(stale.status).toBe("stale");
    expect(stale.token).toBeNull();
    expect(stale.mic).toBe("on"); // stale → listening again
    expect(stale.listenSince).toBe(2000 + STALE_AFTER_MS);
    const q = presenceReducer(stale, {
      type: "tick",
      now: 2000 + STALE_AFTER_MS + OFFER_QR_AFTER_MS,
    });
    expect(q.status).toBe("offer-qr");
  });

  it("a newer token resets the 60 s window", () => {
    const s = inRoom();
    const t = tok(11, 50_000);
    const r = run(
      [
        { type: "heard", token: t },
        { type: "validated", slot: 11, token: t.token },
        { type: "tick", now: 2000 + STALE_AFTER_MS + 5000 },
      ],
      s,
    );
    expect(r.status).toBe("in-room");
  });

  it("stale → in-room again when a fresh token arrives", () => {
    const stale = presenceReducer(inRoom(), { type: "tick", now: 70_000 });
    const t = tok(20, 71_000);
    const r = run(
      [
        { type: "heard", token: t },
        { type: "validated", slot: 20, token: t.token },
      ],
      stale,
    );
    expect(r.status).toBe("in-room");
    expect(r.lost).toBe(false);
  });

  it("the pre-vote check failing drops the token and listens again", () => {
    const s = presenceReducer(inRoom(), { type: "invalidate", at: 30_000 });
    expect(s.status).toBe("stale");
    expect(s.token).toBeNull();
    expect(s.listenSince).toBe(30_000);
  });

  it("paused by the browser → 'Tap to listen again', keeps the token until it ages out", () => {
    const s = presenceReducer(inRoom(), { type: "mic-paused" });
    expect(s.status).toBe("paused");
    expect(s.token?.slot).toBe(10);
    expect(presenceReducer(s, { type: "tick", now: 2000 + STALE_AFTER_MS }).token).toBeNull();
    const resumed = run([{ type: "listen" }, { type: "mic-granted", at: 5000 }], s);
    expect(resumed.status).toBe("in-room");
    expect(presenceReducer(listening(), { type: "mic-paused" }).status).toBe("paused");
  });

  it("mic-denied: a QR-scanned token still gets you in", () => {
    const denied = run([{ type: "listen" }, { type: "mic-denied", problem: "denied" }]);
    const t = tok(4, 3000, "qr");
    const v = presenceReducer(denied, { type: "heard", token: t });
    expect(v.status).toBe("validating");
    expect(presenceReducer(v, { type: "validated", slot: 4, token: t.token }).status).toBe("in-room");
  });

  it("idle: an injected/scanned token is validated without the mic", () => {
    const t = tok(4, 3000, "e2e");
    const r = run([
      { type: "heard", token: t },
      { type: "validated", slot: 4, token: t.token },
    ]);
    expect(r.status).toBe("in-room");
    expect(r.mic).toBe("off");
  });

  it("stop returns to idle", () => {
    expect(presenceReducer(inRoom(), { type: "stop" }).status).toBe("idle");
  });
});

describe("helpers", () => {
  it("maps beaconStatus to reasons", () => {
    expect(rejectReasonOf(0)).toBeNull();
    expect(rejectReasonOf(1)).toBe("not-set");
    expect(rejectReasonOf(2)).toBe("expired");
    expect(rejectReasonOf(3)).toBe("expired");
    expect(rejectReasonOf(4)).toBe("invalid");
    expect(rejectReasonOf(5)).toBe("invalid");
  });

  it("recognises beacon reverts deep in a viem error", () => {
    expect(
      isBeaconRevert({
        cause: { cause: { data: { errorName: "BeaconExpired" } } },
      }),
    ).toBe(true);
    expect(isBeaconRevert({ cause: { data: { errorName: "AlreadyVoted" } } })).toBe(false);
    expect(isBeaconRevert(new Error("x"))).toBe(false);
  });
});
