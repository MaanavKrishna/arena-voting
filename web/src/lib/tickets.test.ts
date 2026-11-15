import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { MAX_TICKETS, buildTicketTree, loadTicketTree, parseTicketList } from "./tickets";

const A = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
const B = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
const C = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as const;
const D = "0x90F79bf6EB2c4f870365E785982E1f101E93b906" as const;

describe("parseTicketList", () => {
  it("splits on commas, spaces and newlines", () => {
    const r = parseTicketList(`${A}, ${B}\n${C} ${D}\r\n`);
    expect(r.addresses).toEqual([A, B, C, D]);
    expect(r.invalid).toEqual([]);
    expect(r.error).toBeNull();
  });

  it("checksums mixed and lower case", () => {
    const r = parseTicketList(`${A.toLowerCase()}\n${B.toUpperCase().replace("0X", "0x")}`);
    expect(r.addresses).toEqual([A, B]);
  });

  it("dedupes case-insensitively, keeping first order", () => {
    const r = parseTicketList(`${A}\n${B}\n${A.toLowerCase()}`);
    expect(r.addresses).toEqual([A, B]);
    expect(r.duplicates).toBe(1);
  });

  it("reports invalid values with 1-based line numbers", () => {
    const r = parseTicketList(`${A}\n\nnope\n${B}, 0x123`);
    expect(r.addresses).toEqual([A, B]);
    expect(r.invalid).toEqual([
      { line: 3, value: "nope" },
      { line: 4, value: "0x123" },
    ]);
  });

  it("errors above 2000 unique addresses", () => {
    const make = (n: number): string =>
      Array.from({ length: n }, (_, i) => getAddress("0x" + (i + 1).toString(16).padStart(40, "0"))).join("\n");
    expect(MAX_TICKETS).toBe(2000);
    expect(parseTicketList(make(2000)).error).toBeNull();
    const big = parseTicketList(make(2001));
    expect(big.error).toBe("too-many");
  });

  it("handles empty input", () => {
    const r = parseTicketList("  \n ");
    expect(r.addresses).toEqual([]);
    expect(r.invalid).toEqual([]);
  });
});

describe("buildTicketTree", () => {
  const tree = buildTicketTree([A, B, C, D]);

  it("uses the OpenZeppelin standard tree over [address]", () => {
    const ref = StandardMerkleTree.of<string[]>([[A], [B], [C], [D]], ["address"]);
    expect(tree.root).toBe(ref.root);
  });

  it("produces proofs that verify, null for outsiders", () => {
    const ref = StandardMerkleTree.of<string[]>([[A], [B], [C], [D]], ["address"]);
    for (const a of [A, B, C, D]) {
      const proof = tree.proofFor(a);
      expect(proof).not.toBeNull();
      expect(StandardMerkleTree.verify(tree.root, ["address"], [a], proof ?? [])).toBe(true);
      expect(proof).toEqual(ref.getProof([a]));
    }
    expect(tree.proofFor("0x0000000000000000000000000000000000000001")).toBeNull();
    expect(tree.proofFor(A.toLowerCase() as `0x${string}`)).not.toBeNull();
  });

  it("loadTicketTree restores the same root and proofs from a dump", () => {
    const loaded = loadTicketTree(JSON.parse(JSON.stringify(tree.dump)));
    expect(loaded.root).toBe(tree.root);
    expect(loaded.proofFor(C)).toEqual(tree.proofFor(C));
  });

  it("rejects an empty list", () => {
    expect(() => buildTicketTree([])).toThrow();
  });

  it("loadTicketTree throws on garbage", () => {
    expect(() => loadTicketTree({ nope: true })).toThrow();
  });
});
