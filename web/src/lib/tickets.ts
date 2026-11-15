import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import type { StandardMerkleTreeData } from "@openzeppelin/merkle-tree/dist/standard";
import { getAddress, isAddress, type Address, type Hex } from "viem";

export const MAX_TICKETS = 2000;

export type TicketParse = {
  addresses: Address[];
  invalid: { line: number; value: string }[];
  duplicates: number;
  error: "too-many" | null;
};

/** Comma, space or newline separated addresses. Checksummed, deduped, invalid values reported by 1-based line. */
export function parseTicketList(text: string): TicketParse {
  const seen = new Set<string>();
  const addresses: Address[] = [];
  const invalid: { line: number; value: string }[] = [];
  let duplicates = 0;
  text.split(/\r\n|\r|\n/).forEach((lineText, i) => {
    for (const value of lineText.split(/[\s,;]+/)) {
      if (value === "") continue;
      if (!isAddress(value, { strict: false })) {
        invalid.push({ line: i + 1, value });
        continue;
      }
      const checksummed = getAddress(value);
      const key = checksummed.toLowerCase();
      if (seen.has(key)) {
        duplicates++;
        continue;
      }
      seen.add(key);
      addresses.push(checksummed);
    }
  });
  return {
    addresses,
    invalid,
    duplicates,
    error: addresses.length > MAX_TICKETS ? "too-many" : null,
  };
}

export type TicketTree = {
  root: Hex;
  dump: StandardMerkleTreeData<string[]>;
  proofFor(address: Address): Hex[] | null;
};

function wrap(tree: StandardMerkleTree<string[]>): TicketTree {
  return {
    root: tree.root as Hex,
    dump: tree.dump(),
    proofFor(address: Address): Hex[] | null {
      if (!isAddress(address, { strict: false })) return null;
      const target = getAddress(address);
      for (const [i, v] of tree.entries()) {
        if (v[0] === target) return tree.getProof(i) as Hex[];
      }
      return null;
    },
  };
}

/** OpenZeppelin StandardMerkleTree over ["address"] leaves (docs/contracts.md "Ticket list (Merkle) encoding"). */
export function buildTicketTree(addresses: Address[]): TicketTree {
  if (addresses.length === 0) throw new RangeError("ticket list is empty");
  const checksummed = addresses.map((a) => getAddress(a));
  return wrap(StandardMerkleTree.of<string[]>(checksummed.map((a) => [a]), ["address"]));
}

export function loadTicketTree(dump: unknown): TicketTree {
  return wrap(StandardMerkleTree.load(dump as StandardMerkleTreeData<string[]>));
}
