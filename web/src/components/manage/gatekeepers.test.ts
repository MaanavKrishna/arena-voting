import { describe, expect, it } from "vitest";
import { extractAddress, reduceGatekeepers } from "./gatekeepers";

const A = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const B = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

describe("reduceGatekeepers", () => {
  it("applies the latest event per address in chain order", () => {
    const set = reduceGatekeepers([
      { args: { gatekeeper: A, allowed: false }, blockNumber: 10n, logIndex: 0 },
      { args: { gatekeeper: A, allowed: true }, blockNumber: 5n, logIndex: 0 },
      { args: { gatekeeper: B, allowed: true }, blockNumber: 6n, logIndex: 1 },
      { args: { gatekeeper: B, allowed: false }, blockNumber: 6n, logIndex: 2 },
    ]);
    expect(set.active).toEqual([]);
    expect(set.revoked).toEqual([B, A]);
  });

  it("re-authorising after a revoke brings the gate back", () => {
    const set = reduceGatekeepers([
      { args: { gatekeeper: A, allowed: true }, blockNumber: 1n, logIndex: 0 },
      { args: { gatekeeper: A.toLowerCase() as `0x${string}`, allowed: false }, blockNumber: 2n, logIndex: 0 },
      { args: { gatekeeper: A, allowed: true }, blockNumber: 3n, logIndex: 0 },
    ]);
    expect(set).toEqual({ active: [A], revoked: [] });
  });

  it("ignores incomplete logs", () => {
    expect(reduceGatekeepers([{ args: {} }])).toEqual({ active: [], revoked: [] });
  });
});

describe("extractAddress", () => {
  it("finds an address in plain text, URIs and URLs", () => {
    expect(extractAddress(A.toLowerCase())).toBe(A);
    expect(extractAddress(`ethereum:${A}@31337`)).toBe(A);
    expect(extractAddress(`https://x.dev/gate?addr=${A}&x=1`)).toBe(A);
  });
  it("rejects anything else", () => {
    expect(extractAddress("hello")).toBeNull();
    expect(extractAddress(`${A}00`)).toBeNull();
  });
});
