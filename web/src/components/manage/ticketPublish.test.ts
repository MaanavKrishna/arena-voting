import { describe, expect, it, vi } from "vitest";
import { fetchVerifiedTicketList } from "@/hooks/useTicketList";
import { publishTicketList } from "./ticketPublish";

const A = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const B = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

describe("publishTicketList", () => {
  it("uploads a file that round-trips to the same root and proofs", async () => {
    const upload = vi.fn<(json: unknown) => Promise<string>>(async () => "ipfs://bafyfake");
    const { root, uri } = await publishTicketList([A, B], upload);
    expect(uri).toBe("ipfs://bafyfake");
    const uploaded = upload.mock.calls[0]![0] as { version: number; format: string };
    expect(uploaded).toMatchObject({ version: 1, format: "oz-standard-merkle-tree" });
    const tree = await fetchVerifiedTicketList(uri, root, async () => uploaded);
    expect(tree.proofFor(A)).not.toBeNull();
    expect(tree.proofFor("0x90F79bf6EB2c4f870365E785982E1f101E93b906")).toBeNull();
  });

  it("refuses an empty list", async () => {
    await expect(publishTicketList([], vi.fn())).rejects.toThrow();
  });
});
