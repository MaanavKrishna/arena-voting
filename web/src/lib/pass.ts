import {
  bytesToHex,
  encodeAbiParameters,
  getAddress,
  hexToBytes,
  isHex,
  keccak256,
  recoverMessageAddress,
  verifyTypedData,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { fromBase64Url, toBase64Url } from "./beacon/payload";

// Door check-in pass. See docs/ground-presence.md "Part 2" and docs/contracts.md "Off-chain signed data".

export const PASS_VERSION = 1;
export const PASS_QR_PREFIX = "arena:p1:";
export const PASS_QR_LENGTH = 187;
export const TICK_SECONDS = 2;
export const MAX_ISSUED_AGE_SECONDS = 600;
export const MAX_ISSUED_FUTURE_SECONDS = 30;
export const MAX_TICK_DRIFT = 2;

export const checkInTypes = {
  CheckInRequest: [
    { name: "contestId", type: "uint256" },
    { name: "voter", type: "address" },
    { name: "sessionKey", type: "address" },
    { name: "issuedAt", type: "uint64" },
  ],
} as const;

export function passDomain(chainId: number, arena: Address) {
  return { name: "Arena", version: "1", chainId, verifyingContract: arena } as const;
}

export type CheckInMessage = {
  contestId: bigint;
  voter: Address;
  sessionKey: Address;
  issuedAt: bigint;
};

export type CheckInTypedData = {
  domain: ReturnType<typeof passDomain>;
  types: typeof checkInTypes;
  primaryType: "CheckInRequest";
  message: CheckInMessage;
};

export type Pass = {
  contestId: bigint;
  voter: Address;
  sessionKey: Address;
  issuedAt: bigint;
  walletSignature: Hex;
  tick: bigint;
  tickSignature: Hex;
};

export type PassFailure =
  | "Malformed"
  | "WrongContest"
  | "IssuedAtTooOld"
  | "IssuedAtInFuture"
  | "TickOutOfRange"
  | "BadTickSignature"
  | "BadWalletSignature";

export type PassResult = { ok: true; pass: Pass } | { ok: false; reason: PassFailure };

export type VerifyTypedDataFn = (
  args: CheckInTypedData & { address: Address; signature: Hex },
) => Promise<boolean>;

/** EOA verification with viem (no RPC). Pass a public client's `verifyTypedData` instead to support contract wallets. */
export const verifyEoaTypedData: VerifyTypedDataFn = (args) => verifyTypedData(args);

export function typedDataFor(
  p: { chainId: number; arena: Address; message: CheckInMessage },
): CheckInTypedData {
  return {
    domain: passDomain(p.chainId, p.arena),
    types: checkInTypes,
    primaryType: "CheckInRequest",
    message: p.message,
  };
}

/** keccak256(abi.encode("arena-tick-v1", chainId, arena, contestId, voter, uint64 tick)). */
export function tickDigest(a: {
  chainId: number;
  arena: Address;
  contestId: bigint;
  voter: Address;
  tick: bigint;
}): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "string" },
        { type: "uint256" },
        { type: "address" },
        { type: "uint256" },
        { type: "address" },
        { type: "uint64" },
      ],
      ["arena-tick-v1", BigInt(a.chainId), a.arena, a.contestId, a.voter, a.tick],
    ),
  );
}

export function tickAt(nowSeconds: bigint): bigint {
  return nowSeconds / BigInt(TICK_SECONDS);
}

type SessionCtx = { chainId: number; arena: Address; sessionPrivateKey: Hex; now: bigint };

async function signTick(
  p: Pick<Pass, "contestId" | "voter">,
  c: SessionCtx,
): Promise<{ tick: bigint; tickSignature: Hex }> {
  const tick = tickAt(c.now);
  const digest = tickDigest({ chainId: c.chainId, arena: c.arena, contestId: p.contestId, voter: p.voter, tick });
  const tickSignature = await privateKeyToAccount(c.sessionPrivateKey).signMessage({
    message: { raw: digest },
  });
  return { tick, tickSignature };
}

/** One wallet approval (EIP-712) plus the first tick signed by the in-memory session key. */
export async function createPass(a: {
  chainId: number;
  arena: Address;
  contestId: bigint;
  voter: Address;
  sessionPrivateKey: Hex;
  signTypedData: (args: CheckInTypedData) => Promise<Hex>;
  issuedAt: bigint;
  now: bigint;
}): Promise<Pass> {
  const sessionKey = privateKeyToAccount(a.sessionPrivateKey).address;
  const voter = getAddress(a.voter);
  const walletSignature = await a.signTypedData(
    typedDataFor({
      chainId: a.chainId,
      arena: a.arena,
      message: { contestId: a.contestId, voter, sessionKey, issuedAt: a.issuedAt },
    }),
  );
  const t = await signTick({ contestId: a.contestId, voter }, a);
  return {
    contestId: a.contestId,
    voter,
    sessionKey,
    issuedAt: a.issuedAt,
    walletSignature,
    ...t,
  };
}

/** New tick for an existing pass (called every 2 s while the QR is shown). */
export async function retickPass(pass: Pass, c: SessionCtx): Promise<Pass> {
  if (privateKeyToAccount(c.sessionPrivateKey).address !== pass.sessionKey) {
    throw new Error("session key does not match the pass");
  }
  return { ...pass, ...(await signTick(pass, c)) };
}

// ---- QR binary layout (187 bytes) -------------------------------------------------------------
// 0 version | 1 contestId u32 | 5 voter(20) | 25 sessionKey(20) | 45 issuedAt u64 | 53 walletSig(65)
// | 118 tick u32 | 122 tickSig(65)

const U32_MAX = BigInt(0xffffffff);
const U64_MAX = (BigInt(1) << BigInt(64)) - BigInt(1);

export function encodePassQR(p: Pass): string {
  if (p.contestId < BigInt(0) || p.contestId > U32_MAX) throw new RangeError("contestId must fit uint32");
  if (p.tick < BigInt(0) || p.tick > U32_MAX) throw new RangeError("tick must fit uint32");
  if (p.issuedAt < BigInt(0) || p.issuedAt > U64_MAX) throw new RangeError("issuedAt must fit uint64");
  const out = new Uint8Array(PASS_QR_LENGTH);
  const view = new DataView(out.buffer);
  out[0] = PASS_VERSION;
  view.setUint32(1, Number(p.contestId), false);
  out.set(hexToBytes(p.voter), 5);
  out.set(hexToBytes(p.sessionKey), 25);
  view.setBigUint64(45, p.issuedAt, false);
  out.set(sigBytes(p.walletSignature), 53);
  view.setUint32(118, Number(p.tick), false);
  out.set(sigBytes(p.tickSignature), 122);
  return PASS_QR_PREFIX + toBase64Url(out);
}

function sigBytes(sig: Hex): Uint8Array {
  const b = hexToBytes(sig);
  if (b.length !== 65) throw new RangeError("signature must be 65 bytes");
  return b;
}

/** Returns null for anything that is not exactly a v1 pass. Never throws. */
export function decodePassQR(text: string): Pass | null {
  const t = text.trim();
  if (!t.startsWith(PASS_QR_PREFIX)) return null;
  const bytes = fromBase64Url(t.slice(PASS_QR_PREFIX.length));
  if (bytes === null || bytes.length !== PASS_QR_LENGTH || bytes[0] !== PASS_VERSION) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    contestId: BigInt(view.getUint32(1, false)),
    voter: getAddress(bytesToHex(bytes.slice(5, 25))),
    sessionKey: getAddress(bytesToHex(bytes.slice(25, 45))),
    issuedAt: view.getBigUint64(45, false),
    walletSignature: bytesToHex(bytes.slice(53, 118)),
    tick: BigInt(view.getUint32(118, false)),
    tickSignature: bytesToHex(bytes.slice(122, 187)),
  };
}

// ---- verification -----------------------------------------------------------------------------

/** Gate rules from docs/contracts.md. Cheap checks first, wallet signature (may hit RPC) last. */
export async function verifyPass(
  pass: Pass,
  ctx: {
    chainId: number;
    arena: Address;
    now: bigint;
    verifyTypedData: VerifyTypedDataFn;
    expectedContestId?: bigint;
  },
): Promise<PassResult> {
  const fail = (reason: PassFailure): PassResult => ({ ok: false, reason });
  if (!isHex(pass.walletSignature) || !isHex(pass.tickSignature)) return fail("Malformed");
  if (ctx.expectedContestId !== undefined && pass.contestId !== ctx.expectedContestId) {
    return fail("WrongContest");
  }
  if (pass.issuedAt < ctx.now - BigInt(MAX_ISSUED_AGE_SECONDS)) return fail("IssuedAtTooOld");
  if (pass.issuedAt > ctx.now + BigInt(MAX_ISSUED_FUTURE_SECONDS)) return fail("IssuedAtInFuture");

  const drift = pass.tick - tickAt(ctx.now);
  if (drift > BigInt(MAX_TICK_DRIFT) || drift < BigInt(-MAX_TICK_DRIFT)) return fail("TickOutOfRange");

  try {
    const digest = tickDigest({
      chainId: ctx.chainId,
      arena: ctx.arena,
      contestId: pass.contestId,
      voter: pass.voter,
      tick: pass.tick,
    });
    const signer = await recoverMessageAddress({ message: { raw: digest }, signature: pass.tickSignature });
    if (signer !== pass.sessionKey) return fail("BadTickSignature");
  } catch {
    return fail("BadTickSignature");
  }

  try {
    const ok = await ctx.verifyTypedData({
      ...typedDataFor({
        chainId: ctx.chainId,
        arena: ctx.arena,
        message: {
          contestId: pass.contestId,
          voter: pass.voter,
          sessionKey: pass.sessionKey,
          issuedAt: pass.issuedAt,
        },
      }),
      address: pass.voter,
      signature: pass.walletSignature,
    });
    return ok ? { ok: true, pass } : fail("BadWalletSignature");
  } catch {
    return fail("BadWalletSignature");
  }
}
