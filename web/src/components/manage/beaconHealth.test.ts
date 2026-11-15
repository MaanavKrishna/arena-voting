import { describe, expect, it } from "vitest";
import { beaconHealth } from "./beaconHealth";
import { buildChecklist } from "./checklist";

const base = { beaconAnchorSet: true, beaconStart: 1000n, beaconLength: 100, beaconCachedIndex: 100, now: 1500n };

describe("beaconHealth", () => {
  it("is not-set without an anchor", () => {
    expect(beaconHealth({ ...base, beaconAnchorSet: false })).toEqual({ state: "not-set" });
  });
  it("waits while nothing has been verified (cached index = length)", () => {
    expect(beaconHealth(base)).toEqual({ state: "waiting" });
  });
  it("maps the cached index to the slot time", () => {
    // index 90 -> slot 9 -> verified at 1000 + 90
    expect(beaconHealth({ ...base, beaconCachedIndex: 90, now: 1100n })).toEqual({
      state: "fresh",
      slot: 9,
      verifiedAt: 1090n,
    });
  });
  it("goes stale after the token window", () => {
    expect(beaconHealth({ ...base, beaconCachedIndex: 90, now: 1090n + 131n }).state).toBe("stale");
    expect(beaconHealth({ ...base, beaconCachedIndex: 90, now: 1090n + 130n }).state).toBe("fresh");
  });
});

describe("buildChecklist", () => {
  const input = { presence: "Gated" as const, liveEntryCount: 0, beaconRotation: 0, activeGatekeepers: 0, shared: false };
  it("lists all four steps for Gated and none done", () => {
    const items = buildChecklist(input);
    expect(items.map((i) => i.id)).toEqual(["entries", "stage", "gate", "share"]);
    expect(items.some((i) => i.done)).toBe(false);
  });
  it("drops stage and gate for Anywhere, gate for Room", () => {
    expect(buildChecklist({ ...input, presence: "Anywhere" }).map((i) => i.id)).toEqual(["entries", "share"]);
    expect(buildChecklist({ ...input, presence: "Room" }).map((i) => i.id)).toEqual(["entries", "stage", "share"]);
  });
  it("ticks from state", () => {
    const items = buildChecklist({ ...input, liveEntryCount: 3, beaconRotation: 1, activeGatekeepers: 2, shared: true });
    expect(items.every((i) => i.done)).toBe(true);
  });
});
