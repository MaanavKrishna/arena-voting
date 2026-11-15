import { describe, expect, it } from "vitest";
import { coverColors, coverGradient, nextBoundary, presenceOf, statusOf } from "./ContestCard";

const times = { submissionEnd: 100n, votingStart: 200n, votingEnd: 300n, finalized: false };

describe("nextBoundary", () => {
  it("counts to the next change in each phase", () => {
    expect(nextBoundary(times, 50n)).toEqual({ label: "Entries close in", to: 100 });
    expect(nextBoundary(times, 150n)).toEqual({ label: "Voting opens in", to: 200 });
    expect(nextBoundary(times, 250n)).toEqual({ label: "Voting closes in", to: 300 });
  });
  it("has nothing to count once voting is over", () => {
    expect(nextBoundary(times, 300n).to).toBeNull();
    expect(nextBoundary({ ...times, finalized: true }, 250n)).toEqual({ label: "Finished", to: null });
  });
});

describe("statusOf", () => {
  it("maps phases to pill status", () => {
    expect(statusOf("voting").status).toBe("live");
    expect(statusOf("submissions").status).toBe("upcoming");
    expect(statusOf("upcoming").status).toBe("upcoming");
    expect(statusOf("ended").status).toBe("ended");
    expect(statusOf("finalized").label).toBe("Winner paid");
  });
});

describe("presenceOf", () => {
  it("labels each mode and falls back to anywhere", () => {
    expect(presenceOf(1).label).toBe("In the room");
    expect(presenceOf(2).label).toBe("Door check-in");
    expect(presenceOf(9).label).toBe("Vote from anywhere");
  });
});

describe("cover gradient", () => {
  it("is deterministic and uses two different entry colours", () => {
    for (let i = 0n; i < 40n; i++) {
      const [a, b] = coverColors(i);
      expect(a).not.toBe(b);
      expect(coverGradient(i)).toBe(coverGradient(i));
    }
  });
  it("differs between neighbouring ids", () => {
    expect(coverGradient(1n)).not.toBe(coverGradient(2n));
  });
});
