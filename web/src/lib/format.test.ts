import { describe, expect, it } from "vitest";
import { byteLength, formatEth, relativeTime, shortAddress } from "./format";

const B = (n: number): bigint => BigInt(n);

describe("shortAddress", () => {
  it("shortens a checksummed address", () => {
    expect(shortAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")).toBe("0xf39F…2266");
  });
  it("leaves short input alone", () => {
    expect(shortAddress("0x1234")).toBe("0x1234");
  });
});

describe("formatEth", () => {
  it("trims trailing zeros", () => {
    expect(formatEth(BigInt("3000000000000000"))).toBe("0.003");
    expect(formatEth(BigInt("1000000000000000000"))).toBe("1");
    expect(formatEth(BigInt("1500000000000000000"))).toBe("1.5");
    expect(formatEth(B(0))).toBe("0");
  });
  it("truncates to max decimals and flags dust", () => {
    expect(formatEth(BigInt("1234567890000000000"))).toBe("1.2345");
    expect(formatEth(BigInt("1234567890000000000"), { maxDecimals: 2 })).toBe("1.23");
    expect(formatEth(B(1))).toBe("<0.0001");
  });
});

describe("relativeTime", () => {
  const now = B(10_000);
  it("future", () => {
    expect(relativeTime(now + B(30), now)).toBe("in 30 s");
    expect(relativeTime(now + B(120), now)).toBe("in 2 min");
    expect(relativeTime(now + B(3 * 3600), now)).toBe("in 3 h");
    expect(relativeTime(now + B(2 * 86400), now)).toBe("in 2 d");
  });
  it("past", () => {
    expect(relativeTime(now - B(30), now)).toBe("30 s ago");
    expect(relativeTime(now - B(600), now)).toBe("10 min ago");
    expect(relativeTime(now - B(86400), now)).toBe("1 d ago");
  });
  it("now", () => {
    expect(relativeTime(now, now)).toBe("now");
    expect(relativeTime(now + B(2), now)).toBe("now");
  });
});

describe("byteLength", () => {
  it("counts UTF-8 bytes", () => {
    expect(byteLength("abc")).toBe(3);
    expect(byteLength("é")).toBe(2);
    expect(byteLength("€")).toBe(3);
    expect(byteLength("😀")).toBe(4);
    expect(byteLength("")).toBe(0);
  });
});
