import { describe, expect, it } from "vitest";
import { arenaAbi } from "@/generated";
import { arenaKeys } from "./shared";
import { LIVE_EVENTS, liveInvalidations } from "./useLiveContest";

describe("useLiveContest events", () => {
  it("watches every per-contest event that changes what the page shows", () => {
    expect([...LIVE_EVENTS].sort()).toEqual(
      [
        "BeaconAdvanced",
        "BeaconSet",
        "CheckedIn",
        "ContestFinalized",
        "EntrySubmitted",
        "EntryWithdrawn",
        "GatekeeperSet",
        "TicketListSet",
        "VoteCast",
      ].sort(),
    );
  });

  it("only names events the contract emits, each filterable by contestId", () => {
    for (const name of LIVE_EVENTS) {
      const ev = arenaAbi.find((x) => x.type === "event" && x.name === name);
      expect(ev, name).toBeDefined();
      const input = ev && "inputs" in ev ? ev.inputs.find((i) => i.name === "contestId") : undefined;
      expect(input && "indexed" in input ? input.indexed : false, name).toBe(true);
    }
  });

  it("refreshes the contest, plus the gatekeeper history on GatekeeperSet", () => {
    expect(liveInvalidations("VoteCast", 31337, 4n)).toEqual([arenaKeys.contest(31337, 4n)]);
    expect(liveInvalidations("GatekeeperSet", 31337, 4n)).toEqual([
      arenaKeys.contest(31337, 4n),
      ["arena", 31337, "logs", "GatekeeperSet"],
    ]);
  });
});
