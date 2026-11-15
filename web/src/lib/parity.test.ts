import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { encodeAbiParameters, hashTypedData, keccak256, slice, type Address, type Hex } from "viem";
import { anchorOf, buildChain, tokenForSlot } from "./beacon/chain";
import { decodePayload, encodePayload, toBase64Url } from "./beacon/payload";
import { buildTicketTree } from "./tickets";
import { checkInTypes, passDomain, tickDigest } from "./pass";

type Fixture = {
  seed: Hex;
  chain: { length: number; anchor: Hex; tokensBySlot: Record<string, Hex> };
  payload: { contestId: number; slot: number; hex: Hex; base64url: string };
  tickets: { addresses: Address[]; root: Hex; proofs: Record<string, Hex[]> };
  pass: {
    chainId: number;
    arena: Address;
    contestId: number;
    voter: Address;
    sessionKey: Address;
    issuedAt: number;
    typedDataHash: Hex;
    tick: number;
    tickDigest: Hex;
  };
};

// vitest runs with cwd = web/
const path = resolve(process.cwd(), "../contracts/test/fixtures/parity.json");
const fx = JSON.parse(readFileSync(path, "utf8")) as Fixture;

describe("parity.json", () => {
  it("chain: anchor and every pinned token (checked with raw keccak256 too)", () => {
    const chain = buildChain(fx.seed, fx.chain.length);
    expect(anchorOf(chain)).toBe(fx.chain.anchor);
    for (const [slot, token] of Object.entries(fx.chain.tokensBySlot)) {
      expect(tokenForSlot(chain, Number(slot))).toBe(token);
    }
    // independent re-derivation: hash the token forward (slot + 1) times -> anchor
    let cur = fx.chain.tokensBySlot["7"];
    for (let i = 0; i < 8; i++) cur = slice(keccak256(cur), 0, 16);
    expect(cur).toBe(fx.chain.anchor);
    expect(chain[0]).toBe(slice(keccak256(fx.seed), 0, 16));
  });

  it("payload: hex and base64url", () => {
    const token = fx.chain.tokensBySlot[String(fx.payload.slot)];
    const bytes = encodePayload({ contestId: fx.payload.contestId, slot: fx.payload.slot, token });
    expect(`0x${Buffer.from(bytes).toString("hex")}`).toBe(fx.payload.hex);
    expect(toBase64Url(bytes)).toBe(fx.payload.base64url);
    expect(decodePayload(fx.payload.base64url)).toEqual({
      contestId: fx.payload.contestId,
      slot: fx.payload.slot,
      token,
    });
  });

  it("tickets: root and proofs", () => {
    const tree = buildTicketTree(fx.tickets.addresses);
    expect(tree.root).toBe(fx.tickets.root);
    for (const a of fx.tickets.addresses) {
      expect(tree.proofFor(a)).toEqual(fx.tickets.proofs[a]);
      expect(StandardMerkleTree.verify(fx.tickets.root, ["address"], [a], fx.tickets.proofs[a])).toBe(true);
    }
  });

  it("pass: typed data hash and tick digest", () => {
    const p = fx.pass;
    expect(
      hashTypedData({
        domain: passDomain(p.chainId, p.arena),
        types: checkInTypes,
        primaryType: "CheckInRequest",
        message: {
          contestId: BigInt(p.contestId),
          voter: p.voter,
          sessionKey: p.sessionKey,
          issuedAt: BigInt(p.issuedAt),
        },
      }),
    ).toBe(p.typedDataHash);
    const digest = tickDigest({
      chainId: p.chainId,
      arena: p.arena,
      contestId: BigInt(p.contestId),
      voter: p.voter,
      tick: BigInt(p.tick),
    });
    expect(digest).toBe(p.tickDigest);
    // independent abi.encode
    const raw = keccak256(
      encodeAbiParameters(
        [{ type: "string" }, { type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "address" }, { type: "uint64" }],
        ["arena-tick-v1", BigInt(p.chainId), p.arena, BigInt(p.contestId), p.voter, BigInt(p.tick)],
      ),
    );
    expect(raw).toBe(p.tickDigest);
  });
});
