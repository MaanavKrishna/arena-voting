import { describe, expect, it } from "vitest";
import { isActivePath } from "@/components/shell/SiteHeader";
import { walletOptions } from "./ConnectSheet";
import { guardState } from "./NetworkGuard";

const c = (id: string, type: string, name = id) => ({ id, uid: `uid-${id}`, type, name, icon: undefined });

describe("walletOptions", () => {
  it("labels the E2E mock connector as Test wallet", () => {
    const out = walletOptions([c("mock", "mock")], { hasInjectedProvider: false });
    expect(out.map((o) => [o.kind, o.label])).toEqual([["test", "Test wallet"]]);
  });

  it("lists announced (EIP-6963) wallets and drops the generic injected duplicate", () => {
    const out = walletOptions([c("injected", "injected"), c("io.metamask", "injected", "MetaMask")], {
      hasInjectedProvider: true,
    });
    expect(out.map((o) => o.label)).toEqual(["MetaMask"]);
  });

  it("falls back to the generic browser wallet only when a provider exists", () => {
    expect(walletOptions([c("injected", "injected")], { hasInjectedProvider: true }).map((o) => o.label)).toEqual([
      "Browser wallet",
    ]);
    expect(walletOptions([c("injected", "injected")], { hasInjectedProvider: false })).toEqual([]);
  });

  it("orders browser wallets, then WalletConnect, then passkey; hides passkey on request", () => {
    const list = [c("baseAccount", "baseAccount"), c("walletConnect", "walletConnect"), c("io.rabby", "injected", "Rabby")];
    expect(walletOptions(list, { hasInjectedProvider: true }).map((o) => o.kind)).toEqual([
      "browser",
      "walletconnect",
      "passkey",
    ]);
    expect(walletOptions(list, { hasInjectedProvider: true, hidePasskey: true }).map((o) => o.kind)).toEqual([
      "browser",
      "walletconnect",
    ]);
  });
});

describe("guardState", () => {
  const base = { mounted: true, targetChainId: 31337 };
  it("is checking before hydration and while reconnecting without an account", () => {
    expect(guardState({ ...base, mounted: false, status: "connected", address: "0x1", chainId: 31337 })).toBe("checking");
    expect(guardState({ ...base, status: "reconnecting" })).toBe("checking");
  });
  it("asks to connect when disconnected", () => {
    expect(guardState({ ...base, status: "disconnected" })).toBe("connect");
  });
  it("flags another network and passes the right one", () => {
    expect(guardState({ ...base, status: "connected", address: "0x1", chainId: 1 })).toBe("wrong-network");
    expect(guardState({ ...base, status: "connected", address: "0x1", chainId: 31337 })).toBe("ready");
  });
});

describe("isActivePath", () => {
  it("matches the section and its children only", () => {
    expect(isActivePath("/explore", "/explore")).toBe(true);
    expect(isActivePath("/explore/live", "/explore")).toBe(true);
    expect(isActivePath("/explorer", "/explore")).toBe(false);
    expect(isActivePath("/c/1", "/create")).toBe(false);
    expect(isActivePath(null, "/create")).toBe(false);
  });
});
