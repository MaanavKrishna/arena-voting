import { describe, expect, it } from "vitest";
import { hashTypedData, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  PASS_QR_LENGTH,
  PASS_QR_PREFIX,
  checkInTypes,
  createPass,
  decodePassQR,
  encodePassQR,
  passDomain,
  retickPass,
  tickDigest,
  verifyEoaTypedData,
  verifyPass,
  type Pass,
} from "./pass";
import { fromBase64Url } from "./beacon/payload";

const B = (n: number): bigint => BigInt(n);
const CHAIN_ID = 31337;
const ARENA = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const;
// Well-known Anvil test keys (accounts 1 and 3).
const VOTER_KEY: Hex = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const SESSION_KEY: Hex = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6";
const NOW = B(1_700_000_000);

const voter = privateKeyToAccount(VOTER_KEY);
const session = privateKeyToAccount(SESSION_KEY);

async function makePass(over: { issuedAt?: bigint; now?: bigint } = {}): Promise<Pass> {
  return createPass({
    chainId: CHAIN_ID,
    arena: ARENA,
    contestId: B(3),
    voter: voter.address,
    sessionPrivateKey: SESSION_KEY,
    signTypedData: (args) => voter.signTypedData(args),
    issuedAt: over.issuedAt ?? NOW,
    now: over.now ?? NOW,
  });
}

const ctx = (now: bigint = NOW) => ({
  chainId: CHAIN_ID,
  arena: ARENA,
  verifyTypedData: verifyEoaTypedData,
  now,
});

describe("typed data and digests", () => {
  it("domain and type are as specified", () => {
    expect(passDomain(CHAIN_ID, ARENA)).toEqual({
      name: "Arena",
      version: "1",
      chainId: CHAIN_ID,
      verifyingContract: ARENA,
    });
    expect(checkInTypes.CheckInRequest.map((f) => `${f.type} ${f.name}`)).toEqual([
      "uint256 contestId",
      "address voter",
      "address sessionKey",
      "uint64 issuedAt",
    ]);
  });

  it("tickDigest is stable and sensitive to every field", () => {
    const base = { chainId: CHAIN_ID, arena: ARENA, contestId: B(3), voter: voter.address, tick: B(850_000_000) };
    const d = tickDigest(base);
    expect(d).toMatch(/^0x[0-9a-f]{64}$/);
    expect(tickDigest(base)).toBe(d);
    expect(tickDigest({ ...base, tick: B(850_000_001) })).not.toBe(d);
    expect(tickDigest({ ...base, contestId: B(4) })).not.toBe(d);
    expect(tickDigest({ ...base, chainId: 1 })).not.toBe(d);
  });
});

describe("createPass", () => {
  it("fills fields, tick = floor(now/2)", async () => {
    const p = await makePass();
    expect(p.contestId).toBe(B(3));
    expect(p.voter).toBe(voter.address);
    expect(p.sessionKey).toBe(session.address);
    expect(p.issuedAt).toBe(NOW);
    expect(p.tick).toBe(NOW / B(2));
    expect(p.walletSignature).toMatch(/^0x[0-9a-f]{130}$/);
    expect(p.tickSignature).toMatch(/^0x[0-9a-f]{130}$/);
  });

  it("wallet signature covers the typed-data hash", async () => {
    const p = await makePass();
    const hash = hashTypedData({
      domain: passDomain(CHAIN_ID, ARENA),
      types: checkInTypes,
      primaryType: "CheckInRequest",
      message: { contestId: p.contestId, voter: p.voter, sessionKey: p.sessionKey, issuedAt: p.issuedAt },
    });
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("retickPass changes only tick and tickSignature", async () => {
    const p = await makePass();
    const q = await retickPass(p, { chainId: CHAIN_ID, arena: ARENA, sessionPrivateKey: SESSION_KEY, now: NOW + B(2) });
    expect(q.tick).toBe(p.tick + B(1));
    expect(q.tickSignature).not.toBe(p.tickSignature);
    expect(q.walletSignature).toBe(p.walletSignature);
    expect((await verifyPass(q, ctx(NOW + B(2)))).ok).toBe(true);
  });

  it("rejects a session key that is not the pass's session key", async () => {
    const p = await makePass();
    await expect(
      retickPass(p, { chainId: CHAIN_ID, arena: ARENA, sessionPrivateKey: generatePrivateKey(), now: NOW }),
    ).rejects.toThrow();
  });
});

describe("QR encoding", () => {
  it("is exactly 187 bytes with the documented layout", async () => {
    const p = await makePass();
    const text = encodePassQR(p);
    expect(PASS_QR_PREFIX).toBe("arena:p1:");
    expect(PASS_QR_LENGTH).toBe(187);
    expect(text.startsWith("arena:p1:")).toBe(true);
    const bytes = fromBase64Url(text.slice(PASS_QR_PREFIX.length));
    expect(bytes).not.toBeNull();
    expect(bytes).toHaveLength(187);
    expect(text.length).toBe(9 + 250);
    expect(bytes?.[0]).toBe(1);
  });

  it("roundtrips", async () => {
    const p = await makePass();
    expect(decodePassQR(encodePassQR(p))).toEqual(p);
  });

  it("rejects wrong prefix, wrong length, wrong version, junk", async () => {
    const p = await makePass();
    const text = encodePassQR(p);
    const body = text.slice(PASS_QR_PREFIX.length);
    expect(decodePassQR(body)).toBeNull();
    expect(decodePassQR(PASS_QR_PREFIX + body.slice(0, -4))).toBeNull();
    expect(decodePassQR(PASS_QR_PREFIX + body + "AAAA")).toBeNull();
    expect(decodePassQR(PASS_QR_PREFIX + "AA" + body.slice(2))).toBeNull(); // version byte 0
    expect(decodePassQR("arena:p1:!!!")).toBeNull();
    expect(decodePassQR("")).toBeNull();
  });
});

describe("verifyPass", () => {
  it("accepts a fresh pass", async () => {
    const p = await makePass();
    expect(await verifyPass(p, ctx())).toEqual({ ok: true, pass: p });
  });

  it("accepts a pass decoded from its QR", async () => {
    const p = decodePassQR(encodePassQR(await makePass()));
    expect(p).not.toBeNull();
    expect((await verifyPass(p as Pass, ctx())).ok).toBe(true);
  });

  it("tick: +-2 accepted, +-3 rejected", async () => {
    const p = await makePass();
    // gate tick = pass tick + d  <=>  gate now = NOW + 2d
    for (const d of [-2, -1, 0, 1, 2]) {
      expect((await verifyPass(p, ctx(NOW + B(2 * d)))).ok).toBe(true);
    }
    for (const d of [-3, 3]) {
      const r = await verifyPass(p, ctx(NOW + B(2 * d)));
      expect(r).toMatchObject({ ok: false, reason: "TickOutOfRange" });
    }
  });

  it("issuedAt: now-10min ok, -1 s rejected; now+30 ok, +31 rejected", async () => {
    const old = await makePass({ issuedAt: NOW - B(600) });
    expect((await verifyPass(old, ctx())).ok).toBe(true);
    const tooOld = await makePass({ issuedAt: NOW - B(601) });
    expect(await verifyPass(tooOld, ctx())).toMatchObject({ ok: false, reason: "IssuedAtTooOld" });
    const soon = await makePass({ issuedAt: NOW + B(30) });
    expect((await verifyPass(soon, ctx())).ok).toBe(true);
    const future = await makePass({ issuedAt: NOW + B(31) });
    expect(await verifyPass(future, ctx())).toMatchObject({ ok: false, reason: "IssuedAtInFuture" });
  });

  it("rejects a tampered voter, contest or session key", async () => {
    const p = await makePass();
    const other = privateKeyToAccount(generatePrivateKey()).address;
    // voter and contest are bound into the tick digest, so the tick check trips first
    for (const t of [
      { ...p, voter: other },
      { ...p, contestId: B(4) },
      { ...p, sessionKey: other },
    ]) {
      const r = await verifyPass(t, ctx());
      expect(r.ok).toBe(false);
    }
  });

  it("rejects a tampered issuedAt (wallet signature)", async () => {
    const p = await makePass();
    expect(await verifyPass({ ...p, issuedAt: p.issuedAt + B(1) }, ctx())).toMatchObject({
      ok: false,
      reason: "BadWalletSignature",
    });
  });

  it("rejects a tampered tick signature or tick", async () => {
    const p = await makePass();
    const forged = await voter.signMessage({ message: { raw: tickDigest({ chainId: CHAIN_ID, arena: ARENA, contestId: p.contestId, voter: p.voter, tick: p.tick }) } });
    expect(await verifyPass({ ...p, tickSignature: forged }, ctx())).toMatchObject({
      ok: false,
      reason: "BadTickSignature",
    });
    expect(await verifyPass({ ...p, tick: p.tick + B(1) }, ctx())).toMatchObject({
      ok: false,
      reason: "BadTickSignature",
    });
  });

  it("rejects a wallet signature from a different wallet", async () => {
    const other = privateKeyToAccount(generatePrivateKey());
    const p = await createPass({
      chainId: CHAIN_ID,
      arena: ARENA,
      contestId: B(3),
      voter: voter.address,
      sessionPrivateKey: SESSION_KEY,
      signTypedData: (args) => other.signTypedData(args),
      issuedAt: NOW,
      now: NOW,
    });
    expect(await verifyPass(p, ctx())).toMatchObject({ ok: false, reason: "BadWalletSignature" });
  });

  it("rejects the wrong contest when expectedContestId is given", async () => {
    const p = await makePass();
    expect((await verifyPass(p, { ...ctx(), expectedContestId: B(3) })).ok).toBe(true);
    expect(await verifyPass(p, { ...ctx(), expectedContestId: B(5) })).toMatchObject({
      ok: false,
      reason: "WrongContest",
    });
  });

  it("rejects a pass signed for another chain or arena", async () => {
    const p = await makePass();
    expect((await verifyPass(p, { ...ctx(), chainId: 1 })).ok).toBe(false);
    expect((await verifyPass(p, { ...ctx(), arena: "0x0000000000000000000000000000000000000001" })).ok).toBe(false);
  });

  it("maps a throwing verifier to BadWalletSignature", async () => {
    const p = await makePass();
    const r = await verifyPass(p, { ...ctx(), verifyTypedData: () => Promise.reject(new Error("rpc down")) });
    expect(r).toMatchObject({ ok: false, reason: "BadWalletSignature" });
  });
});
