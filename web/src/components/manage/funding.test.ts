import { describe, expect, it } from "vitest";
import { zeroAddress } from "viem";
import { checkFunding, checkInsLeft, parseAmount } from "./funding";

const A = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

describe("parseAmount", () => {
  it("parses decimals with dot or comma", () => {
    expect(parseAmount("0.05")).toBe(50_000_000_000_000_000n);
    expect(parseAmount("0,5")).toBe(500_000_000_000_000_000n);
    expect(parseAmount(".5")).toBe(500_000_000_000_000_000n);
    expect(parseAmount("2")).toBe(2_000_000_000_000_000_000n);
  });
  it("rejects zero, negatives and junk", () => {
    for (const t of ["", "0", "0.0", "-1", "abc", "1e3", "1.2.3"]) expect(parseAmount(t)).toBeNull();
  });
});

describe("checkFunding", () => {
  it("explains what is missing, in order", () => {
    expect(checkFunding("", "1")).toMatchObject({ ok: false, reason: expect.stringContaining("Paste") });
    expect(checkFunding("0x12", "1")).toMatchObject({ ok: false });
    expect(checkFunding(zeroAddress, "1")).toMatchObject({ ok: false });
    expect(checkFunding(A, "")).toMatchObject({ ok: false, reason: expect.stringContaining("amount") });
  });
  it("returns a checksummed target and wei value", () => {
    expect(checkFunding(A.toLowerCase(), "0.1")).toEqual({ ok: true, to: A, value: 100_000_000_000_000_000n });
  });
});

describe("checkInsLeft", () => {
  it("divides balance by the drip", () => {
    expect(checkInsLeft(10n, 3n)).toBe(3);
    expect(checkInsLeft(10n, 0n)).toBeNull();
  });
});
