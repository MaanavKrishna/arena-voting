import { describe, expect, it } from "vitest";
import {
  BaseError,
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  InsufficientFundsError,
  TimeoutError,
  UserRejectedRequestError,
  encodeErrorResult,
} from "viem";
import { arenaAbi } from "@/generated";
import { explainError } from "./errors";

const errorItems = arenaAbi.filter((x) => x.type === "error");

function revert(errorName: string) {
  const data = encodeErrorResult({
    abi: arenaAbi,
    errorName: errorName as never,
  });
  const reverted = new ContractFunctionRevertedError({
    abi: arenaAbi,
    data,
    functionName: "vote",
  });
  return new ContractFunctionExecutionError(reverted, {
    abi: arenaAbi,
    functionName: "vote",
    args: [1n, 1, { slot: 0, token: "0x00000000000000000000000000000000" }, []],
  });
}

describe("explainError", () => {
  it("covers the ABI", () => {
    expect(errorItems.length).toBeGreaterThan(30);
  });

  it.each(errorItems.map((e) => e.name))(
    "has plain-English copy for %s",
    (name) => {
      const out = explainError(revert(name));
      expect(out.title.length).toBeGreaterThan(0);
      expect(out.title).not.toBe("Something went wrong. Try again.");
      expect(out.title).not.toMatch(/0x[0-9a-f]{8}/i);
    },
  );

  it("uses the documented copy", () => {
    expect(explainError(revert("AlreadyVoted")).title).toBe(
      "You've already voted in this contest.",
    );
    expect(explainError(revert("BeaconExpired")).title).toBe(
      "We lost the room signal — listening again.",
    );
    expect(explainError(revert("EntryNotFound")).title).toBe(
      "That entry isn't in this contest anymore.",
    );
  });

  it("reports user rejection", () => {
    const err = new BaseError("outer", {
      cause: new UserRejectedRequestError(new BaseError("denied")),
    });
    expect(explainError(err).title).toBe("You cancelled in your wallet.");
  });

  it("reports insufficient funds", () => {
    const err = new BaseError("outer", {
      cause: new InsufficientFundsError({ cause: new BaseError("x") }),
    });
    expect(explainError(err).title).toMatch(/network fee/);
  });

  it("reports timeouts as retryable", () => {
    const err = new BaseError("outer", {
      cause: new TimeoutError({ body: {}, url: "http://127.0.0.1:8545" }),
    });
    expect(explainError(err).action).toBe("retry");
  });

  it("asks to switch network on chain mismatch", () => {
    const e = Object.assign(new Error("chain mismatch"), {
      name: "ConnectorChainMismatchError",
    });
    expect(explainError(e).action).toBe("switch-network");
  });

  it("asks to connect when no wallet is connected", () => {
    const e = Object.assign(new Error("not connected"), {
      name: "ConnectorNotConnectedError",
    });
    expect(explainError(e).action).toBe("connect");
  });

  it("falls back for unknown input", () => {
    for (const v of [new Error("boom"), "weird", null, undefined, 42, {}]) {
      expect(explainError(v)).toEqual({
        title: "Something went wrong. Try again.",
        action: "retry",
      });
    }
  });
});
