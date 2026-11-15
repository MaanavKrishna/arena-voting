import { describe, expect, it, vi } from "vitest";
import { BaseError, ContractFunctionRevertedError } from "viem";
import { arenaAbi } from "@/generated";
import { idleWrite, runWrite, type WriteState, type WriteStatus } from "./useArenaWrite";

const HASH = "0x1111111111111111111111111111111111111111111111111111111111111111" as const;

function harness(over: Partial<Parameters<typeof runWrite<string>>[0]> = {}) {
  const order: string[] = [];
  const states: WriteState[] = [];
  const steps = {
    simulate: vi.fn(async () => {
      order.push("simulate");
      return "request";
    }),
    send: vi.fn(async () => {
      order.push("wallet");
      return HASH;
    }),
    wait: vi.fn(async () => {
      order.push("wait");
      return { status: "success" as const };
    }),
    ...over,
  };
  return { order, states, steps, run: () => runWrite(steps, (s) => states.push(s)) };
}

const statuses = (states: WriteState[]): WriteStatus[] => states.map((s) => s.status);

describe("runWrite", () => {
  it("walks simulating → confirm-in-wallet → pending → confirmed", async () => {
    const h = harness();
    const final = await h.run();
    expect(statuses(h.states)).toEqual(["simulating", "confirm-in-wallet", "pending", "confirmed"]);
    expect(h.order).toEqual(["simulate", "wallet", "wait"]);
    expect(final.txHash).toBe(HASH);
    expect(h.states[2].txHash).toBe(HASH);
    expect(h.steps.send).toHaveBeenCalledWith("request");
  });

  it("never opens the wallet when the simulation reverts, and explains the revert", async () => {
    const revert = new ContractFunctionRevertedError({
      abi: arenaAbi,
      functionName: "vote",
      data: `0x${"0".repeat(64)}`, // unknown selector; replaced below
    });
    // Decoded by name, as viem does after matching the selector in the ABI.
    Object.defineProperty(revert, "data", { value: { errorName: "AlreadyVoted", args: [], abiItem: undefined } });
    const sim = new BaseError("sim failed", { cause: revert });
    const h = harness({ simulate: vi.fn().mockRejectedValue(sim) });
    const final = await h.run();
    expect(h.steps.send).not.toHaveBeenCalled();
    expect(statuses(h.states)).toEqual(["simulating", "error"]);
    expect(final.error?.title).toBe("You've already voted in this contest.");
    expect(final.rawError).toBe(sim);
  });

  it("reports a rejected wallet prompt as a cancel, with no hash", async () => {
    const rejected = Object.assign(new Error("User rejected the request."), { name: "UserRejectedRequestError", code: 4001 });
    const h = harness({ send: vi.fn().mockRejectedValue(rejected) });
    const final = await h.run();
    expect(statuses(h.states)).toEqual(["simulating", "confirm-in-wallet", "error"]);
    expect(final.error?.title).toBe("You cancelled in your wallet.");
    expect(final.txHash).toBeUndefined();
  });

  it("flags an on-chain revert and keeps the hash", async () => {
    const h = harness({ wait: vi.fn(async () => ({ status: "reverted" as const })) });
    const final = await h.run();
    expect(final.status).toBe("error");
    expect(final.txHash).toBe(HASH);
    expect(final.error?.title).toMatch(/failed on the network/i);
  });

  it("starts idle", () => {
    expect(idleWrite).toEqual({ status: "idle", error: null });
  });
});
