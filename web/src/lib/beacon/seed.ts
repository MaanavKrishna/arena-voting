import { keccak256, type Address, type Hex } from "viem";

/** The exact text the organiser's wallet signs (docs/ground-presence.md "Seed"). No trailing newline. */
export function seedMessage(a: {
  contestId: bigint;
  chainId: number;
  arena: Address;
  rotation: number;
}): string {
  return [
    "Arena beacon seed",
    `Contest: ${a.contestId.toString()}`,
    `Chain: ${a.chainId}`,
    `Contract: ${a.arena}`,
    `Rotation: ${a.rotation}`,
    "Only sign this on the Arena Stage page.",
  ].join("\n");
}

export function deriveSeed(signature: Hex): Hex {
  return keccak256(signature);
}
