import { describe, expect, it } from "vitest";
import { phaseOf, type ContestTimes } from "./phase";

const B = (n: number): bigint => BigInt(n);
const c: ContestTimes = {
  submissionEnd: B(1000),
  votingStart: B(2000),
  votingEnd: B(3000),
  finalized: false,
};

describe("phaseOf", () => {
  it.each([
    [0, "submissions"],
    [999, "submissions"],
    [1000, "upcoming"],
    [1999, "upcoming"],
    [2000, "voting"],
    [2999, "voting"],
    [3000, "ended"],
    [999999, "ended"],
  ])("now=%i -> %s", (now, phase) => {
    expect(phaseOf(c, B(now))).toBe(phase);
  });

  it("finalized wins at any time", () => {
    const f = { ...c, finalized: true };
    expect(phaseOf(f, B(3000))).toBe("finalized");
    expect(phaseOf(f, B(0))).toBe("finalized");
  });

  it("skips upcoming when submissionEnd == votingStart", () => {
    const t = { ...c, submissionEnd: B(2000) };
    expect(phaseOf(t, B(1999))).toBe("submissions");
    expect(phaseOf(t, B(2000))).toBe("voting");
  });
});
