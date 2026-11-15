import { describe, expect, it } from "vitest";
import { arenaAddress, deploymentBlock, deploymentState, resolveDeployment } from "./contracts";

const ADDR = "0x5fbdb2315678afecb367f032d93f642f64180aa3";

describe("resolveDeployment", () => {
  it("reads address (checksummed) and block", () => {
    const s = resolveDeployment(31337, (id) => ({ 31337: () => ({ address: ADDR, block: 7 }) })[id]);
    expect(s).toEqual({
      status: "deployed",
      address: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
      block: 7n,
    });
  });

  it("accepts a string block", () => {
    const s = resolveDeployment(1, (id) => ({ 1: () => ({ address: ADDR, block: "9000000" }) })[id]);
    expect(s.status === "deployed" && s.block).toBe(9_000_000n);
  });

  it("reports a missing file as not deployed instead of throwing", () => {
    const missing = () => {
      throw new Error("Cannot find module");
    };
    expect(resolveDeployment(5, (id) => ({ 5: missing })[id])).toEqual({ status: "not-deployed", reason: "missing" });
    expect(resolveDeployment(6, () => undefined)).toEqual({ status: "not-deployed", reason: "missing" });
  });

  it("reports a malformed file as not deployed", () => {
    expect(resolveDeployment(1, () => () => ({ address: "nope", block: 1 }))).toEqual({
      status: "not-deployed",
      reason: "invalid",
    });
    expect(resolveDeployment(1, () => () => ({})).status).toBe("not-deployed");
  });
});

describe("real loaders", () => {
  it("never throws for configured chains, whether or not their file exists", () => {
    for (const id of [31337, 11155111, 1]) {
      expect(() => deploymentState(id)).not.toThrow();
      const addr = arenaAddress(id);
      expect(addr === undefined).toBe(deploymentBlock(id) === undefined);
    }
  });
});
