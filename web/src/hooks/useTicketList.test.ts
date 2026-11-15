import { describe, expect, it, vi } from "vitest";
import { zeroHash } from "viem";
import { buildTicketTree } from "@/lib/tickets";
import { TicketListMismatchError, fetchVerifiedTicketList, verifyTicketList } from "./useTicketList";

const A = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
const B = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as const;
const C = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;

const tree = buildTicketTree([A, B]);
const file = { version: 1, format: "oz-standard-merkle-tree", tree: tree.dump };

describe("verifyTicketList", () => {
  it("accepts a file whose root matches and exposes proofs", () => {
    const t = verifyTicketList(file, tree.root);
    expect(t.proofFor(A)).not.toBeNull();
    expect(t.proofFor(C)).toBeNull();
    expect(t.proofFor(A)).toEqual(tree.proofFor(A));
  });

  it("compares roots case-insensitively", () => {
    expect(() => verifyTicketList(file, tree.root.toUpperCase().replace("0X", "0x") as `0x${string}`)).not.toThrow();
  });

  it("rejects a root mismatch", () => {
    expect(() => verifyTicketList(file, zeroHash)).toThrow(TicketListMismatchError);
    const other = buildTicketTree([A, C]);
    expect(() => verifyTicketList({ ...file, tree: other.dump }, tree.root)).toThrow(/doesn't match/);
  });

  it("rejects malformed files", () => {
    expect(() => verifyTicketList({ nope: 1 }, tree.root)).toThrow(TicketListMismatchError);
    expect(() => verifyTicketList({ ...file, tree: { garbage: true } }, tree.root)).toThrow(TicketListMismatchError);
    expect(() => verifyTicketList(null, tree.root)).toThrow(TicketListMismatchError);
  });
});

describe("fetchVerifiedTicketList", () => {
  it("fetches by uri then verifies", async () => {
    const fetchJson = vi.fn(async () => file);
    const t = await fetchVerifiedTicketList("ipfs://abc", tree.root, fetchJson);
    expect(fetchJson).toHaveBeenCalledWith("ipfs://abc");
    expect(t.root).toBe(tree.root);
  });
});
