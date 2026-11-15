import { describe, expect, it } from "vitest";
import { zeroAddress } from "viem";
import {
  buildEntryMetadata,
  emptyEntryForm,
  entryArgs,
  firstProblem,
  hasErrors,
  validateEntryForm,
  type EntryFormValues,
} from "./entryForm";

const A = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const B = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const C = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";

const valid = (over: Partial<EntryFormValues> = {}): EntryFormValues => ({
  ...emptyEntryForm(A),
  name: "Rocket Cart",
  ...over,
});

describe("validateEntryForm", () => {
  it("accepts a minimal entry", () => {
    expect(hasErrors(validateEntryForm(valid()))).toBe(false);
  });

  it("requires a name and measures limits in bytes", () => {
    expect(validateEntryForm(valid({ name: "  " })).name).toBeTruthy();
    expect(validateEntryForm(valid({ name: "é".repeat(31) })).name).toBeTruthy(); // 62 bytes
    expect(validateEntryForm(valid({ name: "é".repeat(30) })).name).toBeUndefined(); // 60 bytes
    expect(validateEntryForm(valid({ tagline: "x".repeat(121) })).tagline).toBeTruthy();
    expect(validateEntryForm(valid({ description: "x".repeat(1001) })).description).toBeTruthy();
  });

  it("requires a valid, non-zero payee", () => {
    expect(validateEntryForm(valid({ payee: "" })).payee).toBeTruthy();
    expect(validateEntryForm(valid({ payee: "0x123" })).payee).toBeTruthy();
    expect(validateEntryForm(valid({ payee: zeroAddress })).payee).toBeTruthy();
  });

  it("rejects bad, zero, duplicate and payee members", () => {
    const e = validateEntryForm(valid({ members: [B, "nope", zeroAddress, B.toLowerCase(), A, "", C] }));
    expect(e.members[0]).toBeUndefined();
    expect(e.members[1]).toBeTruthy();
    expect(e.members[2]).toBeTruthy();
    expect(e.members[3]).toMatch(/already/);
    expect(e.members[4]).toMatch(/prize wallet/);
    expect(e.members[5]).toBeUndefined();
    expect(e.members[6]).toBeUndefined();
  });

  it("allows only https links and ignores blank rows", () => {
    const e = validateEntryForm(
      valid({
        links: [
          { label: "", url: "" },
          { label: "Demo", url: "http://example.com" },
          { label: "", url: "https://example.com" },
          { label: "Repo", url: "https://github.com/x/y" },
        ],
      }),
    );
    expect(e.links[0]).toBeUndefined();
    expect(e.links[1]?.url).toMatch(/https/);
    expect(e.links[2]?.label).toBeTruthy();
    expect(e.links[3]).toBeUndefined();
    expect(firstProblem(e)).toBeTruthy();
  });
});

describe("buildEntryMetadata / entryArgs", () => {
  it("builds the published JSON shape and drops empty rows", () => {
    const v = valid({ tagline: " Fast ", links: [{ label: "", url: "" }, { label: "Demo", url: "https://x.dev" }] });
    expect(buildEntryMetadata(v, "ipfs://bafy")).toEqual({
      version: 1,
      name: "Rocket Cart",
      tagline: "Fast",
      description: "",
      image: "ipfs://bafy",
      links: [{ label: "Demo", url: "https://x.dev" }],
    });
    expect(buildEntryMetadata(v)).not.toHaveProperty("image");
  });

  it("checksums addresses and skips blank members", () => {
    const args = entryArgs(valid({ payee: A.toLowerCase(), members: [B.toLowerCase(), " "] }), "ipfs://x");
    expect(args).toEqual({ payee: A, metadataURI: "ipfs://x", members: [B] });
  });
});
