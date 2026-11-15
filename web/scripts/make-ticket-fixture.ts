// Generates contracts/test/fixtures/tickets.json: an OpenZeppelin StandardMerkleTree
// over four Anvil default accounts, with the root and one proof per address.
// Run once: pnpm -C web exec tsx scripts/make-ticket-fixture.ts
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";

const addresses = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
] as const;

const tree = StandardMerkleTree.of(
  addresses.map((a) => [a]),
  ["address"],
);

const proofs: Record<string, string[]> = {};
for (const [i, [addr]] of tree.entries()) {
  proofs[addr as string] = tree.getProof(i);
}

const fixture = {
  addresses,
  root: tree.root,
  // Same order as `addresses`; easier to read from Solidity than the keyed map.
  proofList: addresses.map((a) => proofs[a]),
  proofs,
};

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../../contracts/test/fixtures/tickets.json");
writeFileSync(out, JSON.stringify(fixture, null, 2) + "\n");
console.log(`wrote ${out}\nroot ${tree.root}`);
