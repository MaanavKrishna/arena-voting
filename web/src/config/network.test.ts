import { describe, expect, it } from "vitest";
import { buildNetwork, currencyLabel, targetChain } from "./network";

describe("network", () => {
  it("targets the public testnet by default, with an explorer", () => {
    const n = buildNetwork({ anvil: false });
    expect(n.targetChain.id).toBe(11155111);
    expect(n.chains.map((c) => c.id)).toEqual([11155111]);
    expect(n.currencyLabel).toBe("Sepolia ETH");
    expect(n.isTestnet).toBe(true);
    expect(n.explorerTxUrl("0xabc")).toBe("https://sepolia.etherscan.io/tx/0xabc");
    expect(n.explorerAddressUrl("0xdef")).toBe("https://sepolia.etherscan.io/address/0xdef");
  });

  it("targets the local chain (plus the public one) when anvil is enabled, without explorer links", () => {
    const n = buildNetwork({ anvil: true });
    expect(n.targetChain.id).toBe(31337);
    expect(n.chains.map((c) => c.id)).toEqual([31337, 11155111]);
    expect(n.currencyLabel).toBe("Test ETH");
    expect(n.isTestnet).toBe(true);
    expect(n.explorerTxUrl("0xabc")).toBeNull();
    expect(n.explorerAddressUrl("0xdef")).toBeNull();
  });

  it("resolves rpc urls per chain", () => {
    const n = buildNetwork({ anvil: true, sepoliaRpcUrl: "https://rpc.example" });
    expect(n.rpcUrl(31337)).toBe("http://127.0.0.1:8545");
    expect(n.rpcUrl(11155111)).toBe("https://rpc.example");
    expect(n.rpcUrl(1)).toBeUndefined();
  });

  it("module exports follow the env (anvil off in tests)", () => {
    expect(targetChain.id).toBe(11155111);
    expect(currencyLabel).toBe("Sepolia ETH");
  });
});
