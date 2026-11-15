import { describe, expect, it } from "vitest";
import {
  COUNT_MS,
  GATHER_MS,
  countdownNumber,
  effectivePhase,
  gatherTargets,
  parseRevealPreview,
  revealOutcome,
  revealStepAt,
  shouldCelebrate,
  voteShare,
} from "./reveal";

const ETH = 10n ** 18n;
const e = (id: number, votes: number, removed = false) => ({ id, votes, removed });

describe("revealOutcome: which state the Stage shows", () => {
  it("keeps the live results before voting ends", () => {
    for (const phase of ["submissions", "upcoming", "voting", undefined] as const) {
      expect(revealOutcome({ phase, entries: [e(1, 3)], prize: ETH })).toEqual({ kind: "live" });
    }
  });

  it("shows Voting closed once voting has ended but nobody has finalised", () => {
    expect(revealOutcome({ phase: "ended", entries: [e(1, 3), e(2, 1)], prize: ETH })).toEqual({ kind: "closed" });
  });

  it("finalised with one top entry: that winner takes the whole prize", () => {
    expect(revealOutcome({ phase: "finalized", entries: [e(1, 2), e(2, 5), e(3, 4)], prize: ETH })).toEqual({
      kind: "winner",
      winners: [2],
      share: ETH,
    });
  });

  it("finalised tie: every top entry wins and the prize splits like the contract (floor)", () => {
    const out = revealOutcome({ phase: "finalized", entries: [e(1, 4), e(2, 4), e(3, 4), e(4, 1)], prize: 10n });
    expect(out).toEqual({ kind: "tie", winners: [1, 2, 3], share: 3n });
  });

  it("removed entries never win, even with the most votes", () => {
    const out = revealOutcome({ phase: "finalized", entries: [e(1, 9, true), e(2, 4)], prize: ETH });
    expect(out).toEqual({ kind: "winner", winners: [2], share: ETH });
  });

  it("finalised with no votes (or no entries): the prize goes back to the organiser", () => {
    expect(revealOutcome({ phase: "finalized", entries: [e(1, 0), e(2, 0)], prize: ETH })).toEqual({
      kind: "no-votes",
      refund: ETH,
    });
    expect(revealOutcome({ phase: "finalized", entries: [], prize: 0n })).toEqual({ kind: "no-votes", refund: 0n });
    expect(revealOutcome({ phase: "finalized", entries: undefined, prize: ETH }).kind).toBe("no-votes");
  });
});

describe("preview param", () => {
  it("is ignored unless the E2E flag is on", () => {
    expect(parseRevealPreview("reveal", false)).toBeNull();
    expect(parseRevealPreview("reveal", true)).toBe("reveal");
    expect(parseRevealPreview("closed", true)).toBe("closed");
    expect(parseRevealPreview("nonsense", true)).toBeNull();
    expect(parseRevealPreview(null, true)).toBeNull();
  });

  it("pretends the contest is finalised (reveal) or ended (closed)", () => {
    expect(effectivePhase("voting", "reveal")).toBe("finalized");
    expect(effectivePhase("voting", "closed")).toBe("ended");
    expect(effectivePhase("voting", null)).toBe("voting");
  });
});

describe("sequence timing", () => {
  it("full motion: 3 · 2 · 1, gather, then the card", () => {
    expect(revealStepAt(0, "winner", false)).toBe("count-3");
    expect(revealStepAt(COUNT_MS, "winner", false)).toBe("count-2");
    expect(revealStepAt(COUNT_MS * 2 + 10, "winner", false)).toBe("count-1");
    expect(revealStepAt(COUNT_MS * 3, "tie", false)).toBe("gather");
    expect(revealStepAt(COUNT_MS * 3 + GATHER_MS, "tie", false)).toBe("card");
    expect(countdownNumber("count-2")).toBe(2);
    expect(countdownNumber("card")).toBeNull();
  });

  it("reduced motion and no-votes go straight to the card", () => {
    expect(revealStepAt(0, "winner", true)).toBe("card");
    expect(revealStepAt(0, "no-votes", false)).toBe("card");
  });

  it("confetti only for a winner or tie, in full motion, once the card is up", () => {
    expect(shouldCelebrate("winner", "card", false)).toBe(true);
    expect(shouldCelebrate("tie", "card", false)).toBe(true);
    expect(shouldCelebrate("winner", "gather", false)).toBe(false);
    expect(shouldCelebrate("winner", "card", true)).toBe(false);
    expect(shouldCelebrate("no-votes", "card", false)).toBe(false);
  });
});

describe("gatherTargets", () => {
  const seats = [
    { key: "1:0", entryId: 1, x: -1, y: 0 },
    { key: "1:1", entryId: 1, x: -0.8, y: 0.2 },
    { key: "2:0", entryId: 2, x: 1, y: 0 },
    { key: "3:0", entryId: 3, x: 0.9, y: 0.3 },
    { key: "0:0", entryId: 0, x: -0.6, y: 0.6 },
  ];

  it("winner seats stay; every other seat heads for the winner's wedge centre", () => {
    const t = gatherTargets(seats, [1]);
    expect(t.get("1:0")).toEqual({ x: -1, y: 0, stays: true });
    expect(t.get("2:0")).toEqual({ x: -0.9, y: 0.1, stays: false });
    expect(t.get("0:0")?.stays).toBe(false);
  });

  it("ties: each seat goes to the nearest winner", () => {
    const t = gatherTargets(seats, [1, 2]);
    expect(t.get("3:0")).toEqual({ x: 1, y: 0, stays: false });
    expect(t.get("0:0")).toMatchObject({ x: -0.9, stays: false });
  });

  it("no winners: nothing moves", () => {
    expect([...gatherTargets(seats, []).values()].every((v) => v.stays)).toBe(true);
  });
});

it("voteShare rounds against live entries only", () => {
  expect(voteShare(2, [e(1, 2), e(2, 1), e(3, 5, true)])).toBe(67);
  expect(voteShare(0, [])).toBe(0);
});
