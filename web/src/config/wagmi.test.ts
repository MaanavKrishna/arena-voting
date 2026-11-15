import { describe, expect, it } from "vitest";
import { buildConnectors, e2eAccountsFor, getConfig } from "./wagmi";

const base = { e2e: false, baseAccount: false, search: "", origin: "http://localhost:3000" };

describe("e2eAccountsFor", () => {
  it("defaults to anvil 0,1,2", () => {
    expect(e2eAccountsFor("")).toEqual([
      "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    ]);
  });

  it("moves ?e2eAccount=n to the front", () => {
    expect(e2eAccountsFor("?e2eAccount=2")[0]).toBe("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC");
    expect(e2eAccountsFor("?e2eAccount=2")).toHaveLength(3);
    expect(e2eAccountsFor("?e2eAccount=7")[0]).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
  });
});

describe("buildConnectors", () => {
  it("offers only injected without a walletconnect project id or base account flag", () => {
    expect(buildConnectors(base)).toHaveLength(1);
  });
  it("adds walletconnect when a project id is set", () => {
    expect(buildConnectors({ ...base, walletConnectProjectId: "abc" })).toHaveLength(2);
  });
  it("adds base account only behind its flag", () => {
    expect(buildConnectors({ ...base, baseAccount: true })).toHaveLength(2);
    expect(buildConnectors({ ...base, walletConnectProjectId: "abc", baseAccount: true })).toHaveLength(3);
  });
  it("uses only the mock connector in e2e mode", () => {
    expect(buildConnectors({ ...base, e2e: true, baseAccount: true, walletConnectProjectId: "abc" })).toHaveLength(1);
  });
});

describe("getConfig", () => {
  it("is a singleton in the browser and polls every 4 s", () => {
    const a = getConfig();
    expect(getConfig()).toBe(a);
    expect(a.getClient().pollingInterval).toBe(4_000);
    expect(a.chains.map((c) => c.id)).toEqual([11155111]);
  });
});
