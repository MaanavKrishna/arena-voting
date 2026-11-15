import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { RankedList, percentOf, type RankedRow } from "./RankedList";

afterEach(cleanup);

// NumberTicker pauses off-screen via IntersectionObserver, which jsdom lacks.
beforeAll(() => {
  globalThis.IntersectionObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
});

const rows: RankedRow[] = [
  { entryId: 2, name: "Plant Pal", votes: 6, rank: 1, colour: 2, winner: true },
  { entryId: 1, name: "Robo Chef", votes: 3, rank: 2, colour: 1, mine: true },
  { entryId: 3, name: "Night Owl", votes: 3, rank: 2, colour: 3 },
];

describe("percentOf", () => {
  it("rounds to whole percent and is 0 with no votes", () => {
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(2, 3)).toBe(67);
    expect(percentOf(0, 0)).toBe(0);
  });
});

describe("RankedList", () => {
  it("lists every row in the order given, with rank, count and share for screen readers", () => {
    render(<RankedList rows={rows} total={12} />);
    const items = within(screen.getByRole("list", { name: "Ranking" })).getAllByRole("listitem");
    expect(items.map((li) => li.dataset.entry)).toEqual(["2", "1", "3"]);
    expect(items[0]!.textContent).toContain("Plant Pal");
    expect(items[0]!.textContent).toContain("Rank 1, 6 votes, 50 percent");
    expect(items[2]!.textContent).toContain("Rank 2, 3 votes, 25 percent");
  });

  it("marks the winner and your own vote with labelled icons", () => {
    render(<RankedList rows={rows} total={12} />);
    expect(screen.getByLabelText("Winner").closest("li")?.dataset.entry).toBe("2");
    expect(screen.getByLabelText("Your vote").closest("li")?.dataset.entry).toBe("1");
  });

  it("makes rows buttons when they can be opened, and reports highlight", () => {
    const onSelect = vi.fn();
    const onHighlight = vi.fn();
    render(<RankedList rows={rows} total={12} onSelect={onSelect} onHighlight={onHighlight} />);
    const button = screen.getAllByRole("button")[1]!;
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith(1);
    fireEvent.focus(button);
    expect(onHighlight).toHaveBeenLastCalledWith(1);
  });

  it("renders plain rows without onSelect", () => {
    render(<RankedList rows={rows} total={12} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
