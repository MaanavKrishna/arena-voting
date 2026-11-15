import { describe, expect, it } from "vitest";
import { keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildChain } from "./chain";
import { deriveSeed, seedMessage } from "./seed";

const ARENA = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const;
const KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;

describe("seedMessage", () => {
  it("is the exact text from docs/ground-presence.md", () => {
    expect(
      seedMessage({ contestId: BigInt(3), chainId: 31337, arena: ARENA, rotation: 1 }),
    ).toBe(
      [
        "Arena beacon seed",
        "Contest: 3",
        "Chain: 31337",
        `Contract: ${ARENA}`,
        "Rotation: 1",
        "Only sign this on the Arena Stage page.",
      ].join("\n"),
    );
  });
});

describe("deriveSeed", () => {
  it("is keccak256 of the signature and signing is deterministic", async () => {
    const account = privateKeyToAccount(KEY);
    const message = seedMessage({ contestId: BigInt(3), chainId: 31337, arena: ARENA, rotation: 1 });
    const a = await account.signMessage({ message });
    const b = await account.signMessage({ message });
    expect(a).toBe(b);
    expect(deriveSeed(a)).toBe(keccak256(a));
    expect(deriveSeed(a)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(buildChain(deriveSeed(a), 3)).toHaveLength(4);
  });
});
