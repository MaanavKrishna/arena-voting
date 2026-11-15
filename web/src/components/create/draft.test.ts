import { describe, expect, it } from "vitest";
import { localInputToUnix } from "@/components/ui/DateTimeField";
import {
  DRAFT_KEY,
  buildCreateArgs,
  dripFor,
  emptyDraft,
  firstInvalidStep,
  loadDraft,
  parseEthInput,
  presetTimes,
  saveDraft,
  validateBasics,
  validateTiming,
  validateVoters,
  type Draft,
} from "./draft";

const NOW = 1_800_000_000; // chain time, unix seconds
const local = (offsetSec: number) => {
  const d = new Date((NOW + offsetSec) * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const at = (sub: number, start: number, end: number): Draft => ({
  ...emptyDraft,
  submissionEnd: local(sub),
  votingStart: local(start),
  votingEnd: local(end),
});
// minute-resolution values: keep offsets whole minutes and add NOW's seconds slack
const NOW_MIN = NOW - (NOW % 60);

describe("basics", () => {
  it("needs a title and counts bytes, not characters", () => {
    expect(validateBasics({ ...emptyDraft, title: "  " }).title).toBeDefined();
    expect(validateBasics({ ...emptyDraft, title: "a".repeat(80) })).toEqual({});
    expect(validateBasics({ ...emptyDraft, title: "a".repeat(81) }).title).toBeDefined();
    // 41 two-byte characters = 82 bytes but only 41 chars
    expect(validateBasics({ ...emptyDraft, title: "é".repeat(41) }).title).toBeDefined();
    expect(validateBasics({ ...emptyDraft, title: "x", description: "é".repeat(501) }).description).toBeDefined();
    expect(validateBasics({ ...emptyDraft, title: "x", description: "é".repeat(500) })).toEqual({});
  });
});

describe("timing mirrors the contract", () => {
  const t = (s: number, v: number, e: number) => validateTiming(at(s, v, e), NOW_MIN);
  it("accepts a normal timeline, with voting opening right when entries close", () => {
    expect(t(3600, 3600, 7200)).toEqual({});
    expect(t(3600, 5400, 9000)).toEqual({});
  });
  it("requires everything to be set", () => {
    expect(Object.keys(validateTiming(emptyDraft, NOW))).toEqual(["submissionEnd", "votingStart", "votingEnd"]);
  });
  it("entries must close in the future", () => {
    expect(t(-60, 3600, 7200).submissionEnd).toBeDefined();
    expect(t(0, 3600, 7200).submissionEnd).toBeDefined();
  });
  it("voting can't open before entries close", () => {
    expect(t(7200, 3600, 10800).votingStart).toBeDefined();
  });
  it("voting needs 5 min to 7 days", () => {
    expect(t(3600, 3600, 3600 + 240).votingEnd).toMatch(/5 minutes/);
    expect(t(3600, 3600, 3600 + 300)).toEqual({});
    expect(t(3600, 3600, 3600 + 7 * 86400)).toEqual({});
    expect(t(3600, 3600, 3600 + 7 * 86400 + 600).votingEnd).toMatch(/7 days/);
    expect(t(3600, 7200, 7200).votingEnd).toBeDefined();
  });
  it("voting must close within 60 days", () => {
    const sixtyDays = 60 * 86400;
    expect(t(sixtyDays - 7200, sixtyDays - 3600, sixtyDays - 60)).toEqual({});
    expect(t(sixtyDays, sixtyDays, sixtyDays + 3600).votingEnd).toMatch(/60 days/);
  });
});

describe("presets", () => {
  const cases = [
    ["Mon 09:00", new Date(2026, 10, 16, 9, 0)],
    ["Wed 23:50", new Date(2026, 10, 18, 23, 50)],
    ["Sat 11:00", new Date(2026, 10, 21, 11, 0)],
    ["Sun 20:00", new Date(2026, 10, 22, 20, 0)],
  ] as const;
  for (const preset of ["demo-day", "weekend"] as const) {
    for (const [label, date] of cases) {
      it(`${preset} from ${label} passes validation`, () => {
        const now = Math.floor(date.getTime() / 1000);
        const times = presetTimes(preset, now);
        expect(validateTiming({ ...emptyDraft, ...times }, now)).toEqual({});
      });
    }
  }
  it("demo day: entries close in about an hour, voting runs an hour", () => {
    const now = Math.floor(new Date(2026, 10, 16, 14, 2).getTime() / 1000);
    const { submissionEnd, votingStart, votingEnd } = presetTimes("demo-day", now);
    expect(submissionEnd).toBe("2026-11-16T15:05");
    expect(votingStart).toBe(submissionEnd);
    expect(votingEnd).toBe("2026-11-16T16:05");
  });
  it("weekend on a weekday targets Saturday", () => {
    const now = Math.floor(new Date(2026, 10, 16, 9, 0).getTime() / 1000);
    expect(presetTimes("weekend", now)).toEqual({
      submissionEnd: "2026-11-21T10:00",
      votingStart: "2026-11-21T12:00",
      votingEnd: "2026-11-22T12:00",
    });
  });
});

describe("voters", () => {
  it("guest list: invalid lines, empty and over the cap", () => {
    const on = { ...emptyDraft, guestListOn: true };
    expect(validateVoters({ ...on, guestListText: "" }).guestList).toBeDefined();
    expect(validateVoters({ ...on, guestListText: "nope" }).guestList).toMatch(/1 line/);
    const addr = (i: number) => `0x${i.toString(16).padStart(40, "0")}`;
    expect(validateVoters({ ...on, guestListText: addr(1) })).toEqual({});
    const many = Array.from({ length: 2001 }, (_, i) => addr(i + 1)).join("\n");
    expect(validateVoters({ ...on, guestListText: many }).guestList).toMatch(/2,000/);
    expect(validateVoters({ ...emptyDraft, guestListText: "garbage" })).toEqual({});
  });
  it("drip only matters when Gated, max 0.01", () => {
    const gated = { ...emptyDraft, presence: "Gated" as const };
    expect(validateVoters({ ...gated, dripEth: "0.01" })).toEqual({});
    expect(validateVoters({ ...gated, dripEth: "0.0100001" }).dripEth).toBeDefined();
    expect(validateVoters({ ...gated, dripEth: "abc" }).dripEth).toBeDefined();
    expect(validateVoters({ ...emptyDraft, dripEth: "5" })).toEqual({});
  });
  it("sends drip as 0 unless Gated", () => {
    expect(dripFor({ ...emptyDraft, presence: "Room", dripEth: "0.005" })).toBe(0n);
    expect(dripFor({ ...emptyDraft, presence: "Anywhere", dripEth: "0.005" })).toBe(0n);
    expect(dripFor({ ...emptyDraft, presence: "Gated", dripEth: "0.005" })).toBe(5_000_000_000_000_000n);
  });
});

describe("eth input", () => {
  it("parses decimals and rejects junk", () => {
    expect(parseEthInput("0.05")).toEqual({ ok: true, wei: 50_000_000_000_000_000n });
    expect(parseEthInput(".5")).toEqual({ ok: true, wei: 500_000_000_000_000_000n });
    expect(parseEthInput("2.")).toEqual({ ok: true, wei: 2_000_000_000_000_000_000n });
    expect(parseEthInput("0")).toEqual({ ok: true, wei: 0n });
    expect(parseEthInput("")).toEqual({ ok: false, reason: "empty" });
    for (const bad of ["-1", "1e3", "1,5", ".", "0.0000000000000000001", "abc"]) {
      expect(parseEthInput(bad).ok).toBe(false);
    }
  });
});

describe("args and draft storage", () => {
  it("builds createContest args", () => {
    const d: Draft = { ...at(3600, 3600, 7200), title: "  Demo day ", presence: "Gated", dripEth: "0.003" };
    const args = buildCreateArgs(d, { metadataURI: "ipfs://abc" });
    expect(args.title).toBe("Demo day");
    expect(args.submissionEnd).toBe(BigInt(localInputToUnix(d.submissionEnd)!));
    expect(args.presence).toBe(2);
    expect(args.dripPerCheckIn).toBe(3_000_000_000_000_000n);
    expect(args.ticketRoot).toBe(`0x${"0".repeat(64)}`);
    expect(args.ticketListURI).toBe("");
  });
  it("round-trips a draft and survives garbage", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    saveDraft(storage, { ...emptyDraft, title: "Hi", presence: "Gated" }, 2);
    expect(loadDraft(storage)).toEqual({ draft: { ...emptyDraft, title: "Hi", presence: "Gated" }, step: 2 });
    store.set(DRAFT_KEY, "{not json");
    expect(loadDraft(storage)).toEqual({ draft: emptyDraft, step: 0 });
    store.set(DRAFT_KEY, JSON.stringify({ draft: { title: 5, presence: "Nope", prizeEth: "1" }, step: 99 }));
    expect(loadDraft(storage)).toEqual({ draft: { ...emptyDraft, prizeEth: "1" }, step: 0 });
    expect(loadDraft(undefined).step).toBe(0);
  });
  it("finds the first invalid step", () => {
    expect(firstInvalidStep(emptyDraft, NOW)).toBe(0);
    expect(firstInvalidStep({ ...at(3600, 3600, 7200), title: "x" }, NOW_MIN)).toBe(-1);
  });
});
