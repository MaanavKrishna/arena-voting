import { beforeEach, describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { ANVIL_KEYS } from "./anvilKeys";
import {
  ANVIL_ADDRESSES,
  burnerStorageKey,
  burnerWalletClient,
  e2eIndex,
  getOrCreateBurner,
  loadAnvilKeys,
} from "./burner";

beforeEach(() => localStorage.clear());

const anvilKeys = async () => ANVIL_KEYS;

describe("anvil accounts", () => {
  it("are the well-known dev accounts 0..2, and the bundled addresses match the keys", () => {
    expect(ANVIL_KEYS.map((k) => privateKeyToAccount(k).address)).toEqual([
      "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    ]);
    expect(ANVIL_ADDRESSES).toEqual(ANVIL_KEYS.map((k) => privateKeyToAccount(k).address));
  });

  it("loads the keys only when both E2E and the local chain are on", async () => {
    vi.stubEnv("NEXT_PUBLIC_E2E", "1");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_ANVIL", "0");
    expect(await loadAnvilKeys()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_ENABLE_ANVIL", "1");
    expect(await loadAnvilKeys()).toEqual(ANVIL_KEYS);
    vi.unstubAllEnvs();
    expect(await loadAnvilKeys()).toBeNull();
  });
});

describe("getOrCreateBurner", () => {
  it("creates a key once and reuses it under arena:<kind>:<chain>:<contest>", async () => {
    const a = await getOrCreateBurner("stage", 31337, 5n, { e2e: false });
    expect(localStorage.getItem("arena:stage:31337:5")).toBe(a.privateKey);
    const b = await getOrCreateBurner("stage", 31337, "5", { e2e: false });
    expect(b.privateKey).toBe(a.privateKey);
    expect(b.account.address).toBe(a.account.address);
    expect(a.isE2E).toBe(false);
  });

  it("keeps separate keys per kind, chain and contest", async () => {
    const keys = (
      await Promise.all([
        getOrCreateBurner("stage", 1, 1, { e2e: false }),
        getOrCreateBurner("gate", 1, 1, { e2e: false }),
        getOrCreateBurner("stage", 2, 1, { e2e: false }),
        getOrCreateBurner("stage", 1, 2, { e2e: false }),
      ])
    ).map((b) => b.privateKey);
    expect(new Set(keys).size).toBe(4);
  });

  it("replaces a corrupt stored value", async () => {
    localStorage.setItem(burnerStorageKey("gate", 1, 1), "garbage");
    const b = await getOrCreateBurner("gate", 1, 1, { e2e: false });
    expect(b.privateKey).toMatch(/^0x[0-9a-f]{64}$/);
    expect(localStorage.getItem("arena:gate:1:1")).toBe(b.privateKey);
  });

  it("uses an anvil account for ?e2eBurner=n only in e2e mode, without storing it", async () => {
    const b = await getOrCreateBurner("stage", 31337, 1, { e2e: true, search: "?e2eBurner=1", anvilKeys });
    expect(b.account.address).toBe("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
    expect(b.isE2E).toBe(true);
    expect(localStorage.length).toBe(0);

    const off = await getOrCreateBurner("stage", 31337, 1, { e2e: false, search: "?e2eBurner=1", anvilKeys });
    expect(off.account.address).not.toBe("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
  });

  it("is off by default (E2E mode follows the env, which is off in tests)", async () => {
    const b = await getOrCreateBurner("stage", 31337, 1, { search: "?e2eBurner=1", anvilKeys });
    expect(b.isE2E).toBe(false);
  });

  it("falls back to a stored key when the anvil keys aren't bundled", async () => {
    const b = await getOrCreateBurner("stage", 31337, 1, { e2e: true, search: "?e2eBurner=1", anvilKeys: async () => null });
    expect(b.isE2E).toBe(false);
    expect(localStorage.getItem("arena:stage:31337:1")).toBe(b.privateKey);
  });

  it("ignores a bad e2eBurner value", () => {
    expect(e2eIndex("?e2eBurner=9", "e2eBurner")).toBeNull();
    expect(e2eIndex("?e2eBurner=3", "e2eBurner")).toBeNull();
    expect(e2eIndex("?e2eBurner=x", "e2eBurner")).toBeNull();
    expect(e2eIndex("", "e2eBurner")).toBeNull();
    expect(e2eIndex("e2eBurner=2", "e2eBurner")).toBe(2);
  });
});

describe("burnerWalletClient", () => {
  it("builds a client bound to the burner account", async () => {
    const { account } = await getOrCreateBurner("gate", 31337, 1, { e2e: false });
    const client = burnerWalletClient(account);
    expect(client.account?.address).toBe(account.address);
    expect(account.nonceManager).toBeDefined();
  });
});
