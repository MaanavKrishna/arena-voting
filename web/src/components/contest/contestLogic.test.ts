import { describe, expect, it } from "vitest";
import { BaseError, ContractFunctionRevertedError, type Address } from "viem";
import { arenaAbi } from "@/generated";
import { OTHER_ENTRY_ID } from "@/lib/hemicycle";
import {
  NO_BEACON,
  PRESENCE_ANYWHERE,
  PRESENCE_GATED,
  PRESENCE_ROOM,
  createResultsMemory,
  entryName,
  forAccount,
  isContestIdParam,
  isContestNotFound,
  isOwnEntry,
  rankEntries,
  resultsModel,
  shareOf,
  tickerParts,
  verificationOf,
  voteArgs,
  voteBlockReason,
  winnersOf,
  type VoteGate,
} from "./contestLogic";
import { colourVar, resultsSummary } from "@/components/ui/Hemicycle";

const ORGANISER = "0x00000000000000000000000000000000000000A1" as Address;
const PAYEE = "0x00000000000000000000000000000000000000B2" as Address;
const MEMBER = "0x00000000000000000000000000000000000000C3" as Address;
const SUBMITTER = "0x00000000000000000000000000000000000000D4" as Address;
const STRANGER = "0x00000000000000000000000000000000000000E5" as Address;

const entry = (id: number, votes: number, removed = false) => ({
  id,
  votes,
  removed,
  payee: PAYEE,
  submitter: SUBMITTER,
  members: [MEMBER] as Address[],
});

describe("verificationOf", () => {
  it("names each presence mode", () => {
    expect(verificationOf(PRESENCE_ANYWHERE).label).toBe("Anywhere");
    expect(verificationOf(PRESENCE_ROOM).label).toBe("Room-verified");
    expect(verificationOf(PRESENCE_GATED).label).toBe("Door + Room verified");
    expect(verificationOf(7).label).toBe("Anywhere");
  });
});

describe("isOwnEntry", () => {
  const e = { payee: PAYEE, submitter: SUBMITTER, members: [MEMBER] };
  it("bans payee, members and submitter, case-insensitively", () => {
    expect(isOwnEntry(e, PAYEE.toLowerCase(), ORGANISER)).toBe(true);
    expect(isOwnEntry(e, MEMBER, ORGANISER)).toBe(true);
    expect(isOwnEntry(e, SUBMITTER, ORGANISER)).toBe(true);
    expect(isOwnEntry(e, STRANGER, ORGANISER)).toBe(false);
    expect(isOwnEntry(e, undefined, ORGANISER)).toBe(false);
  });
  it("never bans the organiser as submitter, but does as payee or member", () => {
    const curated = { payee: PAYEE, submitter: ORGANISER, members: [] };
    expect(isOwnEntry(curated, ORGANISER, ORGANISER)).toBe(false);
    expect(isOwnEntry({ ...curated, payee: ORGANISER }, ORGANISER, ORGANISER)).toBe(true);
    expect(isOwnEntry({ ...curated, members: [ORGANISER] }, ORGANISER, ORGANISER)).toBe(true);
  });
});

describe("entryName", () => {
  it("uses the metadata name only once it has loaded", () => {
    expect(entryName({ id: 3, metadata: { name: "Robo Chef" }, metadataStatus: "ready" })).toBe("Robo Chef");
    expect(entryName({ id: 3, metadata: { name: "Untitled entry" }, metadataStatus: "failed" })).toBe("Entry 3");
    expect(entryName({ id: 3, metadata: { name: "Untitled entry" }, metadataStatus: "missing" })).toBe("Entry 3");
  });
});

describe("rankEntries / winnersOf", () => {
  const list = [entry(1, 4), entry(2, 9), entry(3, 4), entry(4, 99, true), entry(5, 0)];
  it("ranks by votes then id, shares ranks on ties, drops removed entries", () => {
    const ranked = rankEntries(list);
    expect(ranked.map((e) => [e.id, e.rank])).toEqual([
      [2, 1],
      [1, 2],
      [3, 2],
      [5, 4],
    ]);
  });
  it("picks every top entry, ignoring removed ones", () => {
    expect(winnersOf(list)).toEqual([2]);
    expect(winnersOf([entry(1, 3), entry(2, 3), entry(3, 1)])).toEqual([1, 2]);
  });
  it("has no winner without votes", () => {
    expect(winnersOf([entry(1, 0), entry(2, 0)])).toEqual([]);
    expect(winnersOf([])).toEqual([]);
  });
  it("splits the prize like the contract", () => {
    expect(shareOf(10n, 3)).toBe(3n);
    expect(shareOf(10n, 0)).toBe(0n);
  });
});

describe("resultsModel", () => {
  it("keeps colours by id and passes counts through for up to 8 entries", () => {
    const m = resultsModel([entry(2, 1), entry(1, 5), entry(3, 0, true)]);
    expect(m.colours.get(1)).toBe(1);
    expect(m.colours.get(2)).toBe(2);
    expect(m.colours.has(3)).toBe(false);
    expect(m.counts).toEqual([
      { entryId: 1, votes: 5 },
      { entryId: 2, votes: 1 },
    ]);
    expect(m.total).toBe(6);
  });
  it("folds everything outside the top 7 into Others above 8 entries", () => {
    const many = Array.from({ length: 10 }, (_, i) => entry(i + 1, 10 - i));
    const m = resultsModel(many);
    expect(m.counts).toHaveLength(8);
    expect(m.counts.at(-1)).toEqual({ entryId: OTHER_ENTRY_ID, votes: 3 + 2 + 1 });
    expect(m.colours.get(9)).toBe("other");
    expect(m.total).toBe(55);
  });
  it("keeps an entry's colour while it stays in the top 7 (memory)", () => {
    const model = createResultsMemory();
    const base = Array.from({ length: 9 }, (_, i) => entry(i + 1, 20 - i)); // 1..7 top, 8, 9 others
    const first = model(base);
    const colourOf7 = first.colours.get(7);
    // entry 9 jumps to the top; 7 drops out, 1..6 keep their colours, 9 takes the freed slot
    const second = model(base.map((e) => (e.id === 9 ? { ...e, votes: 100 } : e.id === 7 ? { ...e, votes: 0 } : e)));
    for (let id = 1; id <= 6; id++) expect(second.colours.get(id)).toBe(first.colours.get(id));
    expect(second.colours.get(9)).toBe(colourOf7);
    expect(second.colours.get(7)).toBe("other");
  });

  it("maps colours to tokens", () => {
    expect(colourVar(3)).toBe("var(--color-entry-3)");
    expect(colourVar("other")).toBe("var(--color-entry-other)");
  });
});

describe("resultsSummary", () => {
  it("reads out entries by rank with Others last", () => {
    const names = new Map([
      [1, "Robo Chef"],
      [2, "Plant Pal"],
    ]);
    expect(
      resultsSummary(
        [
          { entryId: 2, votes: 1 },
          { entryId: OTHER_ENTRY_ID, votes: 40 },
          { entryId: 1, votes: 12 },
        ],
        names,
      ),
    ).toBe("Results: Robo Chef 12 votes, Plant Pal 1 vote, Others 40 votes.");
    expect(resultsSummary([], names)).toBe("Results: no votes yet.");
  });
});

describe("voteBlockReason", () => {
  const open: VoteGate = {
    phase: "voting",
    presence: PRESENCE_ANYWHERE,
    presenceReady: true,
    votedEntryId: 0,
    ownEntry: false,
    removed: false,
    ticket: { hasList: false, loading: false, onList: false, failed: false },
    connected: true,
  };
  it("allows a vote in an open Anywhere contest", () => {
    expect(voteBlockReason(open)).toBeNull();
  });
  it("explains closed phases", () => {
    expect(voteBlockReason({ ...open, phase: "upcoming" })).toBe("Voting hasn't opened yet.");
    expect(voteBlockReason({ ...open, phase: "submissions" })).toBe("Voting hasn't opened yet.");
    expect(voteBlockReason({ ...open, phase: "ended" })).toBe("Voting has ended for this contest.");
    expect(voteBlockReason({ ...open, phase: "finalized" })).toBe("Voting has ended for this contest.");
    expect(voteBlockReason({ ...open, phase: undefined })).toBe("Loading the contest…");
  });
  it("leaves connecting to the button", () => {
    expect(voteBlockReason({ ...open, connected: false, votedEntryId: 2, ownEntry: true })).toBeNull();
  });
  it("follows the contract's check order", () => {
    expect(voteBlockReason({ ...open, removed: true, votedEntryId: 1 })).toBe("That entry isn't in this contest anymore.");
    expect(voteBlockReason({ ...open, votedEntryId: 1, ownEntry: true })).toBe("You've already voted in this contest.");
    expect(voteBlockReason({ ...open, ownEntry: true })).toBe("You can't vote for your own team's entry.");
  });
  it("checks the guest list before the room signal, and not at all in Gated contests", () => {
    const listed = { hasList: true, loading: false, onList: false, failed: false };
    expect(voteBlockReason({ ...open, ticket: listed })).toBe("This wallet isn't on the guest list.");
    expect(voteBlockReason({ ...open, ticket: { ...listed, loading: true } })).toBe("Checking the guest list…");
    expect(voteBlockReason({ ...open, ticket: { ...listed, onList: true } })).toBeNull();
    expect(voteBlockReason({ ...open, presence: PRESENCE_ROOM, presenceReady: false, ticket: listed })).toBe(
      "This wallet isn't on the guest list.",
    );
    expect(voteBlockReason({ ...open, presence: PRESENCE_ROOM, presenceReady: false })).toBe("Join the room to vote.");
    expect(voteBlockReason({ ...open, presence: PRESENCE_GATED, presenceReady: false, ticket: listed })).toBe(
      "Check in at the door, then join the room to vote.",
    );
    expect(voteBlockReason({ ...open, presence: PRESENCE_GATED, presenceReady: true, ticket: listed })).toBeNull();
  });

  it("Gated: checked in but not in the room asks for the room; listening says so", () => {
    expect(voteBlockReason({ ...open, presence: PRESENCE_GATED, presenceReady: false, checkedIn: false })).toBe(
      "Check in at the door, then join the room to vote.",
    );
    expect(voteBlockReason({ ...open, presence: PRESENCE_GATED, presenceReady: false, checkedIn: true })).toBe(
      "Join the room to vote.",
    );
    expect(
      voteBlockReason({ ...open, presence: PRESENCE_GATED, presenceReady: false, checkedIn: true, listening: true }),
    ).toBe("Listening for the room…");
    expect(voteBlockReason({ ...open, presence: PRESENCE_ROOM, presenceReady: false, listening: true })).toBe(
      "Listening for the room…",
    );
    expect(voteBlockReason({ ...open, presence: PRESENCE_ROOM, presenceReady: true, listening: true })).toBeNull();
  });
});

describe("voteArgs", () => {
  it("passes zeros for the beacon and an empty proof by default", () => {
    expect(voteArgs(1n, 2, null)).toEqual([1n, 2, NO_BEACON, []]);
    expect(voteArgs(1n, 2, ["0xab"])).toEqual([1n, 2, NO_BEACON, ["0xab"]]);
  });

  it("carries the room token for Room/Gated votes", () => {
    const beacon = { slot: 42, token: "0x0123456789abcdef0123456789abcdef" } as const;
    expect(voteArgs(3n, 1, null, beacon)).toEqual([3n, 1, beacon, []]);
  });
});

describe("isContestNotFound", () => {
  it("finds the ContestNotFound revert anywhere in the cause chain", () => {
    const revert = new ContractFunctionRevertedError({ abi: arenaAbi, functionName: "getContest", data: "0x" });
    Object.defineProperty(revert, "data", { value: { errorName: "ContestNotFound", args: [] } });
    expect(isContestNotFound(new BaseError("read failed", { cause: revert }))).toBe(true);
    Object.defineProperty(revert, "data", { value: { errorName: "VotingNotOpen", args: [] } });
    expect(isContestNotFound(new BaseError("read failed", { cause: revert }))).toBe(false);
    expect(isContestNotFound(new Error("network down"))).toBe(false);
    expect(isContestNotFound(null)).toBe(false);
  });
});

describe("tickerParts", () => {
  it("keeps the decimals formatEth produced", () => {
    expect(tickerParts("0.05")).toEqual({ value: 0.05, decimals: 2 });
    expect(tickerParts("12")).toEqual({ value: 12, decimals: 0 });
    expect(tickerParts("<0.0001")).toEqual({ value: 0.0001, decimals: 4 });
  });
});

describe("isContestIdParam", () => {
  it("accepts positive integers only", () => {
    expect(isContestIdParam("1")).toBe(true);
    expect(isContestIdParam("0042")).toBe(true);
    for (const bad of ["0", "-1", "1.5", "abc", "", "1e3", "0x1", "9".repeat(31)]) expect(isContestIdParam(bad)).toBe(false);
  });
});

describe("forAccount (per-wallet page state)", () => {
  const A = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address;
  const B = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;

  it("keeps a value only for the wallet that set it", () => {
    const voted = { account: A, value: 3 };
    expect(forAccount(voted, A)).toBe(3);
    expect(forAccount(voted, A.toLowerCase() as Address)).toBe(3);
    expect(forAccount(voted, B)).toBeNull();
    expect(forAccount(voted, undefined)).toBeNull();
    expect(forAccount(null, A)).toBeNull();
  });
});
