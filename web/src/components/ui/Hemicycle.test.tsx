import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OTHER_ENTRY_ID, type EntryColour } from "@/lib/hemicycle";
import { Hemicycle, keyedSeats, seatKey, seatRadius } from "./Hemicycle";

afterEach(cleanup);

const names = new Map([
  [1, "Robo Chef"],
  [2, "Plant Pal"],
  [3, "Night Owl"],
]);
const colours = new Map<number, EntryColour>([
  [1, 1],
  [2, 2],
  [3, 3],
  [OTHER_ENTRY_ID, "other"],
]);

const seatsIn = (container: HTMLElement) => Array.from(container.querySelectorAll<SVGCircleElement>("[data-seat]"));

describe("Hemicycle", () => {
  it("draws one seat per vote, with an accessible summary", () => {
    const { container } = render(
      <Hemicycle
        counts={[
          { entryId: 1, votes: 3 },
          { entryId: 2, votes: 5 },
        ]}
        colours={colours}
        names={names}
      />,
    );
    expect(seatsIn(container)).toHaveLength(8);
    const img = screen.getByRole("img");
    expect(img.getAttribute("aria-label")).toBe("Results: Plant Pal 5 votes, Robo Chef 3 votes.");
    expect(screen.queryByTestId("hemicycle-placeholder")).toBeNull();
    expect(screen.queryByTestId("hemicycle-scale")).toBeNull();
  });

  it("orders seats by rank left to right, each entry one contiguous wedge, Others last", () => {
    const { container } = render(
      <Hemicycle
        counts={[
          { entryId: OTHER_ENTRY_ID, votes: 9 },
          { entryId: 1, votes: 2 },
          { entryId: 3, votes: 6 },
          { entryId: 2, votes: 6 },
        ]}
        colours={colours}
        names={names}
      />,
    );
    // DOM order is the left-to-right seat order.
    const owners = seatsIn(container).map((c) => Number(c.dataset.entry));
    const runs = owners.filter((id, i) => i === 0 || owners[i - 1] !== id);
    expect(runs).toEqual([2, 3, 1, OTHER_ENTRY_ID]); // 6 (id 2), 6 (id 3), 2, then Others
    expect(owners).toHaveLength(23);
    expect(seatsIn(container)[0]!.getAttribute("fill")).toBe("var(--color-entry-2)");
    expect(seatsIn(container).at(-1)!.getAttribute("fill")).toBe("var(--color-entry-other)");
  });

  it("shows the 100-seat placeholder and 'No votes yet' when nobody has voted", () => {
    const { container } = render(
      <Hemicycle counts={[{ entryId: 1, votes: 0 }]} colours={colours} names={names}>
        <span>total</span>
      </Hemicycle>,
    );
    expect(seatsIn(container)).toHaveLength(0);
    expect(screen.getByTestId("hemicycle-placeholder").querySelectorAll("circle")).toHaveLength(100);
    expect(screen.getByTestId("hemicycle-empty").textContent).toBe("No votes yet");
    expect(screen.queryByText("total")).toBeNull();
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Results: no votes yet.");
  });

  it("groups votes into seats above 600 and says so", () => {
    const { container } = render(
      <Hemicycle
        counts={[
          { entryId: 1, votes: 601 },
          { entryId: 2, votes: 3 },
        ]}
        colours={colours}
        names={names}
      />,
    );
    // perSeat 2: ceil(601/2) + ceil(3/2) = 301 + 2
    expect(seatsIn(container)).toHaveLength(303);
    expect(screen.getByTestId("hemicycle-scale").textContent).toBe("1 seat = 2 votes");
  });

  it("reports hover and tap so the ranked list can highlight the entry", () => {
    const onHighlight = vi.fn();
    const { container } = render(
      <Hemicycle counts={[{ entryId: 3, votes: 2 }]} colours={colours} names={names} onHighlight={onHighlight} />,
    );
    const seat = seatsIn(container)[0]!;
    fireEvent.pointerEnter(seat);
    expect(onHighlight).toHaveBeenLastCalledWith(3);
    fireEvent.click(seat);
    expect(onHighlight).toHaveBeenLastCalledWith(3);
  });
});

describe("keyedSeats", () => {
  it("keys the k-th seat of each entry so seats keep their identity when ranks change", () => {
    const before = keyedSeats([
      { entryId: 1, votes: 2 },
      { entryId: 2, votes: 1 },
    ]);
    const after = keyedSeats([
      { entryId: 1, votes: 2 },
      { entryId: 2, votes: 3 },
    ]);
    expect(before.seats.map((s) => s.key)).toEqual([seatKey(1, 0), seatKey(1, 1), seatKey(2, 0)]);
    // entry 2 overtakes: its seats move left, the new ones are the only new keys
    expect(after.seats.map((s) => s.key)).toEqual([seatKey(2, 0), seatKey(2, 1), seatKey(2, 2), seatKey(1, 0), seatKey(1, 1)]);
    const added = after.seats.map((s) => s.key).filter((k) => !before.seats.some((b) => b.key === k));
    expect(added).toEqual([seatKey(2, 1), seatKey(2, 2)]);
  });

  it("sizes seats so neighbours never overlap", () => {
    for (const n of [1, 7, 100, 600]) {
      const { seats } = keyedSeats([{ entryId: 1, votes: n }]);
      const r = seatRadius(seats);
      expect(r).toBeGreaterThan(0);
      for (let i = 1; i < seats.length; i++) {
        const a = seats[i - 1]!;
        const b = seats[i]!;
        if (a.row !== b.row) continue;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(2 * r);
      }
    }
  });
});
