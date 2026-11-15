import type { Address, Hex } from "viem";
import { TicketList } from "@/lib/metadata";
import { buildTicketTree } from "@/lib/tickets";
import { uploadToIpfs } from "@/lib/ipfs";

/** Builds the Merkle tree for a guest list and publishes the file the Gate and phones will read. */
export async function publishTicketList(
  addresses: Address[],
  upload: (json: unknown) => Promise<string> = uploadToIpfs,
): Promise<{ root: Hex; uri: string }> {
  const tree = buildTicketTree(addresses);
  const file = TicketList.parse({ version: 1, format: "oz-standard-merkle-tree", tree: tree.dump });
  return { root: tree.root, uri: await upload(file) };
}
