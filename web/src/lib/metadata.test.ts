import { describe, expect, it } from "vitest";
import {
  ContestMetadata,
  EntryMetadata,
  TicketList,
  parseContestMetadata,
  parseEntryMetadata,
} from "./metadata";

const entry = { version: 1, name: "Rocket", tagline: "Goes up", description: "Long text" };

describe("EntryMetadata", () => {
  it("accepts a minimal valid entry", () => {
    expect(EntryMetadata.safeParse(entry).success).toBe(true);
  });

  it("name is 1..60 UTF-8 bytes", () => {
    expect(EntryMetadata.safeParse({ ...entry, name: "" }).success).toBe(false);
    expect(EntryMetadata.safeParse({ ...entry, name: "a".repeat(60) }).success).toBe(true);
    expect(EntryMetadata.safeParse({ ...entry, name: "a".repeat(61) }).success).toBe(false);
    // 30 x 2-byte chars = 60 bytes ok, 31 = 62 bytes rejected although only 31 chars
    expect(EntryMetadata.safeParse({ ...entry, name: "é".repeat(30) }).success).toBe(true);
    expect(EntryMetadata.safeParse({ ...entry, name: "é".repeat(31) }).success).toBe(false);
  });

  it("tagline <= 120 and description <= 1000 bytes", () => {
    expect(EntryMetadata.safeParse({ ...entry, tagline: "a".repeat(120) }).success).toBe(true);
    expect(EntryMetadata.safeParse({ ...entry, tagline: "a".repeat(121) }).success).toBe(false);
    expect(EntryMetadata.safeParse({ ...entry, description: "a".repeat(1000) }).success).toBe(true);
    expect(EntryMetadata.safeParse({ ...entry, description: "a".repeat(1001) }).success).toBe(false);
    expect(EntryMetadata.safeParse({ ...entry, description: "€".repeat(334) }).success).toBe(false);
  });

  it("image must be ipfs://", () => {
    expect(EntryMetadata.safeParse({ ...entry, image: "ipfs://bafybeigdyrzt" }).success).toBe(true);
    expect(EntryMetadata.safeParse({ ...entry, image: "https://x.com/a.png" }).success).toBe(false);
    expect(EntryMetadata.safeParse({ ...entry, image: "ipfs://bafybeigdyrzt/a/b.png" }).success).toBe(true);
    for (const bad of ["ipfs://bafybeigdyrzt/..", "ipfs://bafybeigdyrzt/../../api/upload", "ipfs://bafybeigdyrzt/./a", "ipfs://bafybeigdyrzt/%2e%2e/x", "ipfs://bafybeigdyrzt/a\\b"]) {
      expect(EntryMetadata.safeParse({ ...entry, image: bad }).success, bad).toBe(false);
      expect(ContestMetadata.safeParse({ version: 1, description: "", cover: bad }).success, bad).toBe(false);
    }
  });

  it("links: https only, label <= 40, url <= 200 bytes, max 4", () => {
    const l = (url: string, label = "Site") => ({ label, url });
    expect(EntryMetadata.safeParse({ ...entry, links: [l("https://example.com")] }).success).toBe(true);
    expect(EntryMetadata.safeParse({ ...entry, links: [l("http://example.com")] }).success).toBe(false);
    expect(EntryMetadata.safeParse({ ...entry, links: [l("javascript:alert(1)")] }).success).toBe(false);
    expect(EntryMetadata.safeParse({ ...entry, links: [l("https://example.com", "x".repeat(41))] }).success).toBe(false);
    expect(EntryMetadata.safeParse({ ...entry, links: [l("https://e.com/" + "a".repeat(190))] }).success).toBe(false);
    const five = Array.from({ length: 5 }, () => l("https://example.com"));
    expect(EntryMetadata.safeParse({ ...entry, links: five }).success).toBe(false);
    expect(EntryMetadata.safeParse({ ...entry, links: five.slice(0, 4) }).success).toBe(true);
  });

  it("rejects other versions", () => {
    expect(EntryMetadata.safeParse({ ...entry, version: 2 }).success).toBe(false);
  });
});

describe("parseEntryMetadata", () => {
  it("returns the parsed value when valid", () => {
    expect(parseEntryMetadata(entry)).toEqual(entry);
  });

  it("never throws and falls back to Untitled entry", () => {
    for (const bad of [null, undefined, 42, "x", [], {}, { version: 1 }, { ...entry, name: "" }, { ...entry, links: "no" }]) {
      const r = parseEntryMetadata(bad);
      expect(r.name).toBe("Untitled entry");
      expect(r.version).toBe(1);
      expect(r.tagline).toBe("");
      expect(r.description).toBe("");
    }
  });

  it("survives hostile input (cyclic, throwing getters)", () => {
    const cyc: Record<string, unknown> = { version: 1 };
    cyc.self = cyc;
    expect(parseEntryMetadata(cyc).name).toBe("Untitled entry");
    const evil = {
      get version(): number {
        throw new Error("boom");
      },
    };
    expect(parseEntryMetadata(evil).name).toBe("Untitled entry");
  });
});

describe("ContestMetadata / parseContestMetadata", () => {
  it("validates description and cover", () => {
    expect(ContestMetadata.safeParse({ version: 1, description: "hi" }).success).toBe(true);
    expect(ContestMetadata.safeParse({ version: 1, description: "a".repeat(1001) }).success).toBe(false);
    expect(ContestMetadata.safeParse({ version: 1, description: "", cover: "ipfs://bafy123" }).success).toBe(true);
    expect(ContestMetadata.safeParse({ version: 1, description: "", cover: "http://x" }).success).toBe(false);
  });
  it("falls back to an empty description", () => {
    expect(parseContestMetadata("nope")).toEqual({ version: 1, description: "" });
  });
});

describe("TicketList", () => {
  it("requires the standard tree format", () => {
    const ok = { version: 1, format: "oz-standard-merkle-tree", tree: { format: "standard-v1", tree: [], values: [], leafEncoding: ["address"] } };
    expect(TicketList.safeParse(ok).success).toBe(true);
    expect(TicketList.safeParse({ ...ok, format: "other" }).success).toBe(false);
    expect(TicketList.safeParse({ version: 1, format: "oz-standard-merkle-tree" }).success).toBe(false);
  });
});
