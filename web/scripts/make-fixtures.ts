// Generates contracts/test/fixtures/parity.json (docs/testing.md "Parity fixtures").
// Run: pnpm -C web exec tsx scripts/make-fixtures.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getAddress, hashTypedData, keccak256, toBytes, bytesToHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anchorOf, buildChain, tokenForSlot } from "../src/lib/beacon/chain";
import { encodePayload, toBase64Url } from "../src/lib/beacon/payload";
import { buildTicketTree } from "../src/lib/tickets";
import { checkInTypes, passDomain, tickDigest } from "../src/lib/pass";

const CHAIN_ID = 31337;
const ARENA = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const;
// Well-known Anvil test keys (accounts 1 and 3). Never use them anywhere that holds value.
const VOTER_KEY: Hex = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const SESSION_KEY: Hex = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6";

const seed = keccak256(toBytes("arena parity fixture seed v1"));
const length = 20;
const chain = buildChain(seed, length);

const payloadInput = { contestId: 3, slot: 7, token: tokenForSlot(chain, 7) };
const payloadBytes = encodePayload(payloadInput);

const addresses = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
].map((a) => getAddress(a));
const tree = buildTicketTree(addresses);
const proofs: Record<string, Hex[]> = {};
for (const a of addresses) {
  const p = tree.proofFor(a);
  if (p === null) throw new Error(`no proof for ${a}`);
  proofs[a] = p;
}

const voter = privateKeyToAccount(VOTER_KEY).address;
if (voter !== addresses[1]) throw new Error("voter key does not match Anvil account 1");
const sessionKey = privateKeyToAccount(SESSION_KEY).address;
const passInput = { contestId: 3, issuedAt: 1_700_000_000, tick: 850_000_000 };

const fixture = {
  seed,
  chain: {
    length,
    anchor: anchorOf(chain),
    tokensBySlot: {
      "0": tokenForSlot(chain, 0),
      "7": tokenForSlot(chain, 7),
      "19": tokenForSlot(chain, 19),
    },
  },
  payload: {
    contestId: payloadInput.contestId,
    slot: payloadInput.slot,
    hex: bytesToHex(payloadBytes),
    base64url: toBase64Url(payloadBytes),
  },
  tickets: { addresses, root: tree.root, proofs },
  pass: {
    chainId: CHAIN_ID,
    arena: ARENA,
    contestId: passInput.contestId,
    voter,
    sessionKey,
    issuedAt: passInput.issuedAt,
    typedDataHash: hashTypedData({
      domain: passDomain(CHAIN_ID, ARENA),
      types: checkInTypes,
      primaryType: "CheckInRequest",
      message: {
        contestId: BigInt(passInput.contestId),
        voter,
        sessionKey,
        issuedAt: BigInt(passInput.issuedAt),
      },
    }),
    tick: passInput.tick,
    tickDigest: tickDigest({
      chainId: CHAIN_ID,
      arena: ARENA,
      contestId: BigInt(passInput.contestId),
      voter,
      tick: BigInt(passInput.tick),
    }),
  },
};

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../../contracts/test/fixtures/parity.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(fixture, null, 2) + "\n");
console.log(`wrote ${out}`);
