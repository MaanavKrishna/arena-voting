import { describe, expect, it, vi } from "vitest";
import { CONTESTS_PAGE_SIZE, filterContests, loadAllContests } from "./useContests";
import type { ContestView } from "./types";

function contest(id: number, over: Partial<ContestView> = {}): ContestView {
  return {
    id: BigInt(id),
    organiser: "0x0000000000000000000000000000000000000001",
    title: `Contest ${id}`,
    submissionEnd: 100n,
    votingStart: 200n,
    votingEnd: 300n,
    finalized: false,
    ...over,
  } as ContestView;
}

describe("filterContests", () => {
  const all = [
    contest(1, { title: "Hack Night" }),
    contest(2, { title: "Pizza Poll", finalized: true }),
    contest(3, { title: "Robot Wars", organiser: "0x00000000000000000000000000000000000000Ab" }),
  ];

  it("splits tabs by phase at chain time", () => {
    // t=250 → voting for 1 and 3; 2 is finalized
    expect(filterContests(all, { tab: "live" }, 250n).map((c) => c.id)).toEqual([1n, 3n]);
    expect(filterContests(all, { tab: "ended" }, 250n).map((c) => c.id)).toEqual([2n]);
    expect(filterContests(all, { tab: "upcoming" }, 250n)).toEqual([]);
    expect(filterContests(all, { tab: "upcoming" }, 50n).map((c) => c.id)).toEqual([1n, 3n]);
    expect(filterContests(all, { tab: "upcoming" }, 150n).map((c) => c.id)).toEqual([1n, 3n]);
    expect(filterContests(all, { tab: "ended" }, 400n).map((c) => c.id)).toEqual([1n, 2n, 3n]);
    expect(filterContests(all, {}, 400n)).toHaveLength(3);
  });

  it("searches title, organiser and id, case-insensitively", () => {
    expect(filterContests(all, { search: "pizza" }, 0n).map((c) => c.id)).toEqual([2n]);
    expect(filterContests(all, { search: "  ROBOT " }, 0n).map((c) => c.id)).toEqual([3n]);
    expect(filterContests(all, { search: "00AB" }, 0n).map((c) => c.id)).toEqual([3n]);
    expect(filterContests(all, { search: "nothing" }, 0n)).toEqual([]);
  });

  it("combines tab and search", () => {
    expect(filterContests(all, { tab: "live", search: "hack" }, 250n).map((c) => c.id)).toEqual([1n]);
  });
});

describe("loadAllContests", () => {
  it("pages until a short page", async () => {
    const total = 120;
    const page = vi.fn(async (offset: bigint, limit: bigint) =>
      Array.from({ length: Math.max(0, Math.min(Number(limit), total - Number(offset))) }, (_, i) =>
        contest(Number(offset) + i + 1),
      ),
    );
    const out = await loadAllContests(page);
    expect(out).toHaveLength(120);
    expect(page.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      [0n, CONTESTS_PAGE_SIZE],
      [50n, CONTESTS_PAGE_SIZE],
      [100n, CONTESTS_PAGE_SIZE],
    ]);
  });

  it("asks once more after an exact multiple and stops on the empty page", async () => {
    const pages = [Array.from({ length: 50 }, (_, i) => contest(i + 1)), []];
    const page = vi.fn(async () => pages.shift()!);
    expect(await loadAllContests(page)).toHaveLength(50);
    expect(page).toHaveBeenCalledTimes(2);
  });

  it("returns nothing for no contests", async () => {
    expect(await loadAllContests(async () => [])).toEqual([]);
  });
});
