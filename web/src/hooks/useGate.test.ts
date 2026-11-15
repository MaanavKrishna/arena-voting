import { describe, expect, it } from "vitest";
import { ContractFunctionRevertedError, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arenaAbi } from "@/generated";
import { createPass, encodePassQR, retickPass, verifyEoaTypedData } from "@/lib/pass";
import {
  ACCEPT_COOLDOWN_MS,
  BURST_LIMIT,
  FLASH_MS,
  REJECT_HOLD_MS,
  SAME_VOTER_QUIET_MS,
  canScan,
  gateErrorCopy,
  checkInsLeft,
  evaluateScan,
  gateReducer,
  initialGate,
  isBurst,
  isQuietRepeat,
  nextToSend,
  queueCounts,
  revertName,
  type GateState,
  type ScanDeps,
  type Verdict,
} from "./useGate";

const CHAIN_ID = 31337;
const ARENA = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const;
// Well-known Anvil test keys (accounts 1 and 3); test funds only.
const VOTER_KEY: Hex = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const SESSION_KEY: Hex = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6";
const NOW = 1_700_000_000n;
const voter = privateKeyToAccount(VOTER_KEY);
const OTHER: Address = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

async function passText(o: { contestId?: bigint; issuedAt?: bigint; now?: bigint } = {}): Promise<string> {
  const pass = await createPass({
    chainId: CHAIN_ID,
    arena: ARENA,
    contestId: o.contestId ?? 3n,
    voter: voter.address,
    sessionPrivateKey: SESSION_KEY,
    signTypedData: (args) => voter.signTypedData(args),
    issuedAt: o.issuedAt ?? NOW,
    now: o.now ?? NOW,
  });
  return encodePassQR(pass);
}

function deps(over: Partial<ScanDeps> = {}): ScanDeps {
  return {
    chainId: CHAIN_ID,
    arena: ARENA,
    contestId: 3n,
    now: NOW,
    verifyTypedData: verifyEoaTypedData,
    isKnownCheckedIn: () => false,
    isCheckedInOnChain: async () => false,
    ticketList: { hasList: false, ready: true, proofFor: () => null },
    ...over,
  };
}

describe("evaluateScan", () => {
  it("accepts a fresh, correctly signed pass", async () => {
    const v = await evaluateScan(await passText(), deps());
    expect(v).toEqual({ ok: true, voter: voter.address, proof: [] });
  });

  it("rejects text that isn't a pass", async () => {
    expect(await evaluateScan("https://example.com", deps())).toEqual({ ok: false, reason: "not-a-pass" });
  });

  it("rejects a stale tick (screenshot) more than 2 ticks old", async () => {
    // Pass ticked at NOW, gate clock 6 s later = 3 ticks of drift.
    const v = await evaluateScan(await passText(), deps({ now: NOW + 6n }));
    expect(v).toMatchObject({ ok: false, reason: "stale" });
  });

  it("still accepts a tick within ±2", async () => {
    const v = await evaluateScan(await passText(), deps({ now: NOW + 4n }));
    expect(v.ok).toBe(true);
  });

  it("re-ticked pass is accepted again later", async () => {
    const text = await passText();
    const base = await createPass({
      chainId: CHAIN_ID,
      arena: ARENA,
      contestId: 3n,
      voter: voter.address,
      sessionPrivateKey: SESSION_KEY,
      signTypedData: (args) => voter.signTypedData(args),
      issuedAt: NOW,
      now: NOW,
    });
    const later = await retickPass(base, { chainId: CHAIN_ID, arena: ARENA, sessionPrivateKey: SESSION_KEY, now: NOW + 60n });
    expect((await evaluateScan(text, deps({ now: NOW + 60n }))).ok).toBe(false);
    expect((await evaluateScan(encodePassQR(later), deps({ now: NOW + 60n }))).ok).toBe(true);
  });

  it("rejects an expired request (issued more than 10 min ago)", async () => {
    const v = await evaluateScan(await passText({ issuedAt: NOW - 601n }), deps());
    expect(v).toMatchObject({ ok: false, reason: "expired" });
  });

  it("rejects a pass for another contest", async () => {
    const v = await evaluateScan(await passText({ contestId: 4n }), deps());
    expect(v).toEqual({ ok: false, reason: "wrong-contest", voter: voter.address });
  });

  it("rejects a tampered wallet signature", async () => {
    const text = await passText();
    const otherContestText = await passText({ contestId: 4n });
    // Splice contest 3's header with contest 4's signatures: the tick signature no longer matches.
    const bad = text.slice(0, 20) + otherContestText.slice(20);
    const v = await evaluateScan(bad, deps());
    expect(v.ok).toBe(false);
  });

  it("rejects a duplicate from the local cache without touching the chain", async () => {
    let chainCalls = 0;
    const v = await evaluateScan(
      await passText(),
      deps({
        isKnownCheckedIn: (a) => a === voter.address,
        isCheckedInOnChain: async () => {
          chainCalls++;
          return false;
        },
      }),
    );
    expect(v).toEqual({ ok: false, reason: "already-in", voter: voter.address });
    expect(chainCalls).toBe(0);
  });

  it("rejects a duplicate found on chain", async () => {
    const v = await evaluateScan(await passText(), deps({ isCheckedInOnChain: async () => true }));
    expect(v).toEqual({ ok: false, reason: "already-in", voter: voter.address });
  });

  it("treats a failed chain read as not checked in (the contract re-checks)", async () => {
    const v = await evaluateScan(
      await passText(),
      deps({ isCheckedInOnChain: () => Promise.reject(new Error("rpc down")) }),
    );
    expect(v.ok).toBe(true);
  });

  it("attaches the ticket proof when there's a guest list", async () => {
    const proof: Hex[] = ["0x" + "11".repeat(32)] as Hex[];
    const v = await evaluateScan(
      await passText(),
      deps({ ticketList: { hasList: true, ready: true, proofFor: () => proof } }),
    );
    expect(v).toEqual({ ok: true, voter: voter.address, proof });
  });

  it("rejects wallets that aren't on the guest list, and waits for the list to load", async () => {
    const text = await passText();
    expect(await evaluateScan(text, deps({ ticketList: { hasList: true, ready: true, proofFor: () => null } }))).toMatchObject({
      ok: false,
      reason: "not-on-list",
    });
    expect(await evaluateScan(text, deps({ ticketList: { hasList: true, ready: false, proofFor: () => null } }))).toMatchObject({
      ok: false,
      reason: "list-loading",
    });
  });
});

const accept = (s: GateState, at: number, who: Address = voter.address): GateState =>
  gateReducer(gateReducer(s, { type: "scan-start", at }), { type: "verdict", verdict: { ok: true, voter: who, proof: [] }, at });

describe("gateReducer: scanning", () => {
  it("accept: flashes green, queues a check-in, caches the wallet, starts the cooldown", () => {
    const s = accept(initialGate, 1_000);
    expect(s.flash).toEqual({ kind: "accepted", voter: voter.address, at: 1_000 });
    expect(s.verifying).toBe(false);
    expect(s.queue).toHaveLength(1);
    expect(s.queue[0]).toMatchObject({ id: 1, voter: voter.address, status: "queued", attempts: 0 });
    expect(s.checkedIn[voter.address.toLowerCase()]).toBe(true);
    expect(s.busyUntil).toBe(1_000 + ACCEPT_COOLDOWN_MS);
  });

  it("cooldown: ignores scans for 1.5 s after a success", () => {
    const s = accept(initialGate, 1_000);
    expect(canScan(s, 1_000 + ACCEPT_COOLDOWN_MS - 1)).toBe(false);
    expect(gateReducer(s, { type: "scan-start", at: 1_200 })).toBe(s);
    expect(canScan(s, 1_000 + ACCEPT_COOLDOWN_MS)).toBe(true);
  });

  it("ignores scans while one is being verified", () => {
    const s = gateReducer(initialGate, { type: "scan-start", at: 10 });
    expect(s.verifying).toBe(true);
    expect(canScan(s, 10_000)).toBe(false);
  });

  it("duplicate: an ok verdict for an admitted wallet becomes 'already in'", () => {
    let s = accept(initialGate, 1_000);
    s = accept(s, 5_000);
    expect(s.queue).toHaveLength(1);
    expect(s.flash).toMatchObject({ kind: "rejected", reason: "already-in" });
  });

  it("the person just admitted is ignored quietly for a few seconds", () => {
    const s = accept(initialGate, 1_000);
    expect(isQuietRepeat(s, voter.address, 1_000 + SAME_VOTER_QUIET_MS - 1)).toBe(true);
    expect(isQuietRepeat(s, voter.address, 1_000 + SAME_VOTER_QUIET_MS)).toBe(false);
    expect(isQuietRepeat(s, OTHER, 1_500)).toBe(false);
  });

  it("reject: flashes red with the reason and holds scanning briefly", () => {
    const v: Verdict = { ok: false, reason: "stale", voter: voter.address };
    const s = gateReducer(gateReducer(initialGate, { type: "scan-start", at: 0 }), { type: "verdict", verdict: v, at: 0 });
    expect(s.flash).toEqual({ kind: "rejected", reason: "stale", voter: voter.address, at: 0 });
    expect(s.queue).toHaveLength(0);
    expect(s.busyUntil).toBe(REJECT_HOLD_MS);
    expect(s.checkedIn).toEqual({});
  });

  it("an 'already in' reject from the chain fills the local cache", () => {
    const v: Verdict = { ok: false, reason: "already-in", voter: OTHER };
    const s = gateReducer(initialGate, { type: "verdict", verdict: v, at: 0 });
    expect(s.checkedIn[OTHER.toLowerCase()]).toBe(true);
  });

  it("the flash clears only after FLASH_MS", () => {
    const s = accept(initialGate, 1_000);
    expect(gateReducer(s, { type: "flash-clear", at: 1_000 + FLASH_MS - 1 }).flash).not.toBeNull();
    expect(gateReducer(s, { type: "flash-clear", at: 1_000 + FLASH_MS }).flash).toBeNull();
  });

  it("flags a burst of more than 6 check-ins a minute", () => {
    let s = initialGate;
    const people = Array.from({ length: BURST_LIMIT + 1 }, (_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}` as Address);
    people.forEach((p, i) => {
      s = accept(s, i * 2_000, p);
    });
    const last = BURST_LIMIT * 2_000;
    expect(isBurst(s, last)).toBe(true);
    expect(isBurst(s, last + 60_000)).toBe(false);
    // only BURST_LIMIT in the window → no flag
    expect(isBurst(s, 2_000 + 60_000 - 1)).toBe(false);
  });
});

describe("gateReducer: queue", () => {
  it("success: queued → sending → pending → confirmed, one send at a time", () => {
    let s = accept(initialGate, 0);
    s = accept(s, 2_000, OTHER);
    expect(nextToSend(s)?.id).toBe(1);
    s = gateReducer(s, { type: "tx-sending", id: 1 });
    expect(s.queue[0]).toMatchObject({ status: "sending", attempts: 1 });
    expect(nextToSend(s)).toBeNull();
    s = gateReducer(s, { type: "tx-sent", id: 1, hash: "0xabc" });
    expect(s.queue[0]).toMatchObject({ status: "pending", hash: "0xabc" });
    // the next one goes out without waiting for #1 to confirm
    expect(nextToSend(s)?.id).toBe(2);
    s = gateReducer(s, { type: "tx-confirmed", id: 1 });
    expect(s.queue[0].status).toBe("confirmed");
    expect(queueCounts(s)).toEqual({ waiting: 1, confirmed: 1, failed: 0 });
  });

  it("failure then retry", () => {
    let s = accept(initialGate, 0);
    s = gateReducer(s, { type: "tx-sending", id: 1 });
    s = gateReducer(s, { type: "tx-failed", id: 1, error: "Not enough funds" });
    expect(s.queue[0]).toMatchObject({ status: "failed", error: "Not enough funds" });
    expect(nextToSend(s)).toBeNull();
    expect(queueCounts(s).failed).toBe(1);
    s = gateReducer(s, { type: "retry", id: 1 });
    expect(s.queue[0]).toMatchObject({ status: "queued", error: undefined });
    s = gateReducer(s, { type: "tx-sending", id: 1 });
    expect(s.queue[0].attempts).toBe(2);
  });

  it("a failed check-in takes the wallet off the local list, so a rescan isn't refused as already in", () => {
    let s = accept(initialGate, 0);
    const k = voter.address.toLowerCase();
    expect(s.checkedIn[k]).toBe(true);
    s = gateReducer(s, { type: "tx-sending", id: 1 });
    s = gateReducer(s, { type: "tx-failed", id: 1, error: "Not enough funds" });
    expect(s.checkedIn[k]).toBeUndefined();
    // a fresh scan is admitted again rather than flashing "already in"
    const again = accept({ ...s, busyUntil: 0, flash: null }, 10_000);
    expect(again.flash?.kind).toBe("accepted");
    // a retry puts the wallet back on the list while it's in flight
    s = gateReducer(s, { type: "retry", id: 1 });
    expect(s.checkedIn[k]).toBe(true);
  });

  it("a mined-but-reverted check-in also leaves the local list; another gate's check-in keeps it", () => {
    let s = accept(initialGate, 0);
    s = gateReducer(s, { type: "tx-sending", id: 1 });
    s = gateReducer(s, { type: "tx-sent", id: 1, hash: "0xabc" });
    s = gateReducer(s, { type: "tx-failed", id: 1, error: "The network turned it down." });
    expect(s.checkedIn[voter.address.toLowerCase()]).toBeUndefined();

    let t = accept(initialGate, 0);
    t = gateReducer(t, { type: "tx-sending", id: 1 });
    t = gateReducer(t, { type: "tx-failed", id: 1, error: "x", alreadyIn: true });
    expect(t.checkedIn[voter.address.toLowerCase()]).toBe(true);
  });

  it("retry only applies to failed items", () => {
    const s = accept(initialGate, 0);
    expect(gateReducer(s, { type: "retry", id: 1 })).toBe(s);
  });

  it("checked in by another gate counts as done, with a note", () => {
    let s = accept(initialGate, 0);
    s = gateReducer(s, { type: "tx-sending", id: 1 });
    s = gateReducer(s, { type: "tx-failed", id: 1, error: "x", alreadyIn: true });
    expect(s.queue[0]).toMatchObject({ status: "confirmed", note: expect.stringContaining("another gate") });
  });
});

describe("helpers", () => {
  it("checkInsLeft counts drip plus gas", () => {
    // 0.003 drip + 120k gas at 1 gwei = 0.00312 per check-in
    expect(checkInsLeft(10n ** 17n, 3n * 10n ** 15n, 10n ** 9n)).toBe(32);
    expect(checkInsLeft(undefined, 1n, 1n)).toBeNull();
    expect(checkInsLeft(1n, 0n, 0n)).toBeNull();
    expect(checkInsLeft(0n, 3n * 10n ** 15n, 10n ** 9n)).toBe(0);
  });

  it("gateErrorCopy speaks for the gate", () => {
    expect(gateErrorCopy(new Error("insufficient funds for gas * price + value"))).toMatch(/gate is out of funds/i);
    expect(gateErrorCopy(Object.assign(new Error("x"), { data: { errorName: "NotGatekeeper" } }))).toMatch(/isn't authorised/);
  });

  it("revertName finds the contract error", () => {
    const err = new ContractFunctionRevertedError({
      abi: arenaAbi,
      functionName: "checkIn",
      data: "0x" as Hex,
    });
    Object.assign(err, { data: { errorName: "AlreadyCheckedIn" } });
    expect(revertName(err)).toBe("AlreadyCheckedIn");
    expect(revertName(new Error("x"))).toBeUndefined();
  });
});
