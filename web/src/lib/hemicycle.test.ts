import { describe, expect, it } from "vitest";
import {
  CHAMBER_SEATS,
  OTHER_ENTRY_ID,
  assignEntryColours,
  hemicycleGeometry,
  hemicycleRows,
  hemicycleSeats,
  type EntryColour,
} from "./hemicycle";

const one = (votes: number) => [{ entryId: 1, votes }];

describe("hemicycleRows", () => {
  it("is clamp(ceil(sqrt(n/4)), 1, 14)", () => {
    expect(hemicycleRows(1)).toBe(1);
    expect(hemicycleRows(4)).toBe(1);
    expect(hemicycleRows(5)).toBe(2);
    expect(hemicycleRows(100)).toBe(5);
    expect(hemicycleRows(600)).toBe(13);
    expect(hemicycleRows(10_000)).toBe(14);
  });
});

describe("hemicycleGeometry", () => {
  it.each([1, 2, 7, 100, 600])("has exactly n=%i positions with unit-circle coordinates", (n) => {
    const g = hemicycleGeometry(n);
    expect(g).toHaveLength(n);
    for (const s of g) {
      expect(s.y).toBeGreaterThanOrEqual(-1e-9);
      expect(Math.hypot(s.x, s.y)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it("orders left to right by angle (180deg to 0deg)", () => {
    const g = hemicycleGeometry(100);
    for (let i = 1; i < g.length; i++) expect(g[i].angle).toBeLessThanOrEqual(g[i - 1].angle + 1e-12);
    expect(g[0].angle).toBeCloseTo(Math.PI, 9);
    expect(g[g.length - 1].angle).toBeCloseTo(0, 9);
  });

  it("outer rows hold more seats than inner rows", () => {
    const g = hemicycleGeometry(200);
    const count = new Map<number, number>();
    for (const s of g) count.set(s.row, (count.get(s.row) ?? 0) + 1);
    const rows = [...count.keys()].sort((a, b) => a - b);
    for (let i = 1; i < rows.length; i++) {
      expect(count.get(rows[i]) ?? 0).toBeGreaterThanOrEqual(count.get(rows[i - 1]) ?? 0);
    }
  });

  it("is memoised by n", () => {
    expect(hemicycleGeometry(50)).toBe(hemicycleGeometry(50));
  });
});

describe("hemicycleSeats", () => {
  it.each([1, 7, 100, 600])("perSeat = 1 and seats = n for n = %i", (n) => {
    const r = hemicycleSeats(one(n));
    expect(r.perSeat).toBe(1);
    expect(r.seats).toHaveLength(n);
    expect(r.placeholder).toBe(false);
  });

  it("n = 601 -> perSeat 2 and seats = sum of ceil(group / 2)", () => {
    const counts = [
      { entryId: 1, votes: 301 },
      { entryId: 2, votes: 200 },
      { entryId: 3, votes: 100 },
    ];
    const r = hemicycleSeats(counts);
    expect(r.perSeat).toBe(2);
    expect(r.seats).toHaveLength(151 + 100 + 50);
  });

  it("n = 0 is a placeholder with zero seats and an all-empty chamber", () => {
    for (const c of [[], [{ entryId: 1, votes: 0 }]]) {
      const r = hemicycleSeats(c);
      expect(r.placeholder).toBe(true);
      expect(r.seats).toEqual([]);
      expect(r.perSeat).toBe(1);
      expect(r.chamber).toHaveLength(CHAMBER_SEATS);
      expect(r.empty).toHaveLength(CHAMBER_SEATS);
    }
  });

  describe("small tallies sit in a fixed chamber", () => {
    it.each([1, 2, 3, 7, 24])("n=%i: seats come from the %i-slot chamber, the rest are empty", (n) => {
      const r = hemicycleSeats(one(n));
      expect(r.seats).toHaveLength(n);
      expect(r.chamber).toHaveLength(CHAMBER_SEATS);
      expect(r.empty).toHaveLength(CHAMBER_SEATS - n);
      const slot = (p: { row: number; angle: number }) => `${p.row}:${p.angle.toFixed(9)}`;
      const slots = new Set(r.chamber.map(slot));
      for (const s of r.seats) expect(slots.has(slot(s))).toBe(true);
      const empties = new Set(r.empty.map(slot));
      for (const s of r.seats) expect(empties.has(slot(s))).toBe(false);
    });

    it("fills from the centre outward: more votes only widen the occupied block", () => {
      const spread = (n: number) => {
        const angles = hemicycleSeats(one(n)).seats.map((s) => Math.abs(s.angle - Math.PI / 2));
        return Math.max(...angles);
      };
      expect(spread(1)).toBeLessThan(0.3);
      for (let n = 2; n <= 24; n++) expect(spread(n)).toBeGreaterThanOrEqual(spread(n - 1) - 1e-9);
      // a single vote is nowhere near the far ends of the arc
      expect(spread(3)).toBeLessThan(Math.PI / 4);
    });

    it("keeps seats in left-to-right order with sequential indexes and contiguous ranked wedges", () => {
      const r = hemicycleSeats([
        { entryId: 1, votes: 2 },
        { entryId: 2, votes: 5 },
      ]);
      r.seats.forEach((s, i) => expect(s.index).toBe(i));
      for (let i = 1; i < r.seats.length; i++) expect(r.seats[i].angle).toBeLessThanOrEqual(r.seats[i - 1].angle + 1e-12);
      expect(r.seats.map((s) => s.entryId)).toEqual([2, 2, 2, 2, 2, 1, 1]);
    });

    it("larger tallies are unchanged: own geometry, no chamber", () => {
      const r = hemicycleSeats(one(25));
      expect(r.chamber).toEqual([]);
      expect(r.empty).toEqual([]);
      expect(r.seats.map((s) => ({ index: s.index, row: s.row, angle: s.angle, x: s.x, y: s.y }))).toEqual(hemicycleGeometry(25));
    });
  });

  it("groups entries into contiguous wedges ranked by votes", () => {
    const r = hemicycleSeats([
      { entryId: 1, votes: 5 },
      { entryId: 2, votes: 20 },
      { entryId: 3, votes: 12 },
    ]);
    const order = r.seats.map((s) => s.entryId);
    expect(order).toEqual([...Array(20).fill(2), ...Array(12).fill(3), ...Array(5).fill(1)]);
    // wedge 2 sits on the left (largest angle)
    expect(r.seats[0].angle).toBeGreaterThan(r.seats[r.seats.length - 1].angle);
  });

  it("breaks ties by entry id and puts Others last", () => {
    const r = hemicycleSeats([
      { entryId: OTHER_ENTRY_ID, votes: 50 },
      { entryId: 5, votes: 10 },
      { entryId: 2, votes: 10 },
    ]);
    const firsts = r.seats.map((s) => s.entryId).filter((id, i, a) => a.indexOf(id) === i);
    expect(firsts).toEqual([2, 5, OTHER_ENTRY_ID]);
  });

  it("gives every entry with at least one vote at least one seat", () => {
    const counts = [{ entryId: 1, votes: 1000 }, ...Array.from({ length: 10 }, (_, i) => ({ entryId: i + 2, votes: 1 }))];
    const r = hemicycleSeats(counts);
    expect(r.perSeat).toBe(Math.ceil(1010 / 600));
    for (const c of counts) expect(r.seats.some((s) => s.entryId === c.entryId)).toBe(true);
  });

  it("ignores zero-vote entries", () => {
    const r = hemicycleSeats([
      { entryId: 1, votes: 3 },
      { entryId: 2, votes: 0 },
    ]);
    expect(r.seats.every((s) => s.entryId === 1)).toBe(true);
    expect(r.seats).toHaveLength(3);
  });

  it("assigns seat indexes in order", () => {
    const r = hemicycleSeats(one(30));
    r.seats.forEach((s, i) => expect(s.index).toBe(i));
  });
});

describe("assignEntryColours", () => {
  const live = (n: number) => Array.from({ length: n }, (_, i) => ({ entryId: i + 10, votes: (i * 7) % 5 }));

  it("<= 8 entries: stable by id order regardless of votes or input order", () => {
    const entries = live(8);
    const a = assignEntryColours(entries);
    const b = assignEntryColours([...entries].reverse());
    entries.forEach((e, i) => expect(a.get(e.entryId)).toBe(i + 1));
    expect([...b.entries()].sort()).toEqual([...a.entries()].sort());
  });

  it("an entry never changes colour when votes change (<= 8)", () => {
    const before = assignEntryColours([
      { entryId: 3, votes: 1 },
      { entryId: 1, votes: 9 },
      { entryId: 2, votes: 5 },
    ]);
    const after = assignEntryColours([
      { entryId: 3, votes: 100 },
      { entryId: 1, votes: 9 },
      { entryId: 2, votes: 5 },
    ]);
    expect(after).toEqual(before);
    expect(before.get(1)).toBe(1);
    expect(before.get(3)).toBe(3);
  });

  it("> 8 entries: top 7 by votes get 1..7, the rest are other", () => {
    const entries = Array.from({ length: 12 }, (_, i) => ({ entryId: i + 1, votes: 100 - i }));
    const m = assignEntryColours(entries);
    const colours = new Set<EntryColour>();
    for (let id = 1; id <= 7; id++) colours.add(m.get(id) as EntryColour);
    expect(colours.size).toBe(7);
    for (const c of colours) expect(typeof c === "number" && c >= 1 && c <= 7).toBe(true);
    for (let id = 8; id <= 12; id++) expect(m.get(id)).toBe("other");
  });

  it("> 8 entries: colours are sticky while an entry stays in the top 7", () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({ entryId: i + 1, votes: 100 - i * 10 }));
    const first = assignEntryColours(entries);
    // swap ranks 1 and 2, and let entry 8 overtake entry 7 (7 drops out, 8 enters)
    const next = entries.map((e) => {
      if (e.entryId === 1) return { ...e, votes: 85 };
      if (e.entryId === 2) return { ...e, votes: 99 };
      if (e.entryId === 8) return { ...e, votes: 45 };
      if (e.entryId === 7) return { ...e, votes: 30 };
      return e;
    });
    const second = assignEntryColours(next, first);
    for (const id of [1, 2, 3, 4, 5, 6]) expect(second.get(id)).toBe(first.get(id));
    expect(second.get(7)).toBe("other");
    expect(second.get(8)).toBe(first.get(7)); // takes the freed colour
  });

  it("drops to <= 8 live entries: back to id order", () => {
    const m = assignEntryColours(
      [
        { entryId: 4, votes: 0 },
        { entryId: 2, votes: 0 },
      ],
      new Map<number, EntryColour>([[4, "other"]]),
    );
    expect(m.get(2)).toBe(1);
    expect(m.get(4)).toBe(2);
  });

  it("an entry previously coloured 8 is reassigned when it is in the top 7", () => {
    const prev = new Map<number, EntryColour>([[8, 8]]);
    const entries = Array.from({ length: 9 }, (_, i) => ({ entryId: i + 1, votes: i + 1 }));
    const m = assignEntryColours(entries, prev);
    const c = m.get(8);
    expect(typeof c === "number" && c >= 1 && c <= 7).toBe(true);
  });
});
