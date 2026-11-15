import { describe, expect, it } from "vitest";
import {
  decodePayload,
  encodePayload,
  fromBase64Url,
  toBase64Url,
  toQrText,
  PAYLOAD_LENGTH,
} from "./payload";
import { bytesToHex, type Hex } from "viem";

const TOKEN: Hex = "0x00112233445566778899aabbccddeeff";
const P = { contestId: 3, slot: 7, token: TOKEN };

describe("encodePayload", () => {
  it("lays out v1 big-endian in 25 bytes", () => {
    const b = encodePayload(P);
    expect(b).toHaveLength(25);
    expect(PAYLOAD_LENGTH).toBe(25);
    expect(bytesToHex(b)).toBe("0x01" + "00000003" + "00000007" + TOKEN.slice(2));
  });

  it("handles uint32 maxima", () => {
    const b = encodePayload({ contestId: 0xffffffff, slot: 0x01020304, token: TOKEN });
    expect(bytesToHex(b).slice(0, 20)).toBe("0x01ffffffff01020304");
    expect(decodePayload(b)).toEqual({ contestId: 0xffffffff, slot: 0x01020304, token: TOKEN });
  });

  it("rejects out-of-range fields", () => {
    expect(() => encodePayload({ ...P, contestId: -1 })).toThrow();
    expect(() => encodePayload({ ...P, slot: 2 ** 32 })).toThrow();
    expect(() => encodePayload({ ...P, slot: 1.5 })).toThrow();
    expect(() => encodePayload({ ...P, token: "0x1234" })).toThrow();
  });
});

describe("decodePayload", () => {
  it("roundtrips bytes, base64url and QR text", () => {
    const b = encodePayload(P);
    expect(decodePayload(b)).toEqual(P);
    expect(decodePayload(toBase64Url(b))).toEqual(P);
    expect(decodePayload(toQrText(P))).toEqual(P);
    expect(decodePayload(bytesToHex(b))).toEqual(P);
  });

  it("QR text is arena:b1: + 34 chars", () => {
    const t = toQrText(P);
    expect(t.startsWith("arena:b1:")).toBe(true);
    expect(t.length).toBe(9 + 34);
  });

  it("rejects wrong version", () => {
    const b = encodePayload(P);
    b[0] = 2;
    expect(decodePayload(b)).toBeNull();
  });

  it("rejects wrong length", () => {
    const b = encodePayload(P);
    expect(decodePayload(b.slice(0, 24))).toBeNull();
    expect(decodePayload(new Uint8Array(26))).toBeNull();
    expect(decodePayload(toBase64Url(b.slice(0, 24)))).toBeNull();
    expect(decodePayload("")).toBeNull();
  });

  it("rejects junk and other QR prefixes", () => {
    expect(decodePayload("not base64 !!")).toBeNull();
    expect(decodePayload("arena:p1:" + toBase64Url(encodePayload(P)))).toBeNull();
  });

  it("tolerates surrounding whitespace", () => {
    expect(decodePayload(`  ${toQrText(P)}\n`)).toEqual(P);
  });
});

describe("base64url", () => {
  it("roundtrips with no padding and url-safe alphabet", () => {
    const bytes = new Uint8Array([251, 255, 254, 0, 1]);
    const s = toBase64Url(bytes);
    expect(s).not.toMatch(/[+/=]/);
    expect(fromBase64Url(s)).toEqual(bytes);
  });
  it("returns null on invalid input", () => {
    expect(fromBase64Url("a+b")).toBeNull();
    expect(fromBase64Url("a")).toBeNull();
  });
});
