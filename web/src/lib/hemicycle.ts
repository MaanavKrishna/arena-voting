// Hemicycle layout and entry colours. See docs/design-system.md sections 2.3 and 9.

/** Entry id 0 means "none" on-chain; the Hemicycle uses it for the grouped "Others" wedge. */
export const OTHER_ENTRY_ID = 0;
export const MAX_SEATS = 600;
export const MAX_ROWS = 14;
export const PALETTE_SIZE = 8;
/**
 * Seats in the chamber that small tallies sit in. Up to this many votes the real seats take the
 * middle of a fixed `CHAMBER_SEATS` grid (the rest stay as empty slots), so a handful of votes reads
 * as a part-filled chamber instead of a few dots stranded at the ends of the arc.
 */
export const CHAMBER_SEATS = 24;

export type Seat = {
  /** Entry id, or OTHER_ENTRY_ID for the grouped Others wedge. */
  entryId: number;
  /** Position in left-to-right order (0 = leftmost). */
  index: number;
  /** Row, 0 = innermost. */
  row: number;
  /** Radians, pi (left) to 0 (right). */
  angle: number;
  /** Unit coordinates: outer radius 1, centre (0, 0), y up (flip for SVG). */
  x: number;
  y: number;
};

export type SeatPosition = Omit<Seat, "entryId">;

export type HemicycleOptions = {
  /** Inner radius as a fraction of the outer radius. Default 0.4. */
  innerRadius?: number;
  /** Seat budget before votes are grouped (perSeat > 1). Default 600. */
  maxSeats?: number;
  /** Size of the fixed chamber small tallies sit in. Default `CHAMBER_SEATS`. */
  chamberSeats?: number;
};

export type HemicycleResult = {
  seats: Seat[];
  perSeat: number;
  /** True when there are no votes at all. */
  placeholder: boolean;
  /**
   * The fixed chamber grid (left to right) while the tally fits in it (including no votes), else [].
   * `seats` occupy `chamber.length - empty.length` of its slots.
   */
  chamber: SeatPosition[];
  /** Chamber slots with no seat in them: draw these as the faint placeholder grid. */
  empty: SeatPosition[];
};

export function hemicycleRows(n: number): number {
  return Math.min(Math.max(Math.ceil(Math.sqrt(n / 4)), 1), MAX_ROWS);
}

const geometryCache = new Map<string, SeatPosition[]>();

/** `n` seat positions in left-to-right order (ties on angle: inner row first). Memoised by n and radius. */
export function hemicycleGeometry(n: number, innerRadius = 0.4): SeatPosition[] {
  const key = `${n}:${innerRadius}`;
  const cached = geometryCache.get(key);
  if (cached) return cached;
  if (n <= 0) return [];

  const rows = hemicycleRows(n);
  const radii = Array.from({ length: rows }, (_, i) =>
    rows === 1 ? 1 : innerRadius + (i * (1 - innerRadius)) / (rows - 1),
  );
  const total = radii.reduce((a, b) => a + b, 0);

  // Seats per row proportional to arc length (= radius), largest-remainder rounding so the sum is n.
  const ideal = radii.map((r) => (n * r) / total);
  const counts = ideal.map(Math.floor);
  let left = n - counts.reduce((a, b) => a + b, 0);
  const byRemainder = ideal
    .map((v, i) => ({ i, rem: v - Math.floor(v) }))
    .sort((a, b) => b.rem - a.rem || b.i - a.i);
  for (const { i } of byRemainder) {
    if (left <= 0) break;
    counts[i]++;
    left--;
  }

  const positions: SeatPosition[] = [];
  for (let row = 0; row < rows; row++) {
    const k = counts[row];
    for (let j = 0; j < k; j++) {
      const angle = k === 1 ? Math.PI / 2 : Math.PI - (j * Math.PI) / (k - 1);
      positions.push({
        index: 0,
        row,
        angle,
        x: radii[row] * Math.cos(angle),
        y: radii[row] * Math.sin(angle),
      });
    }
  }
  positions.sort((a, b) => b.angle - a.angle || a.row - b.row);
  positions.forEach((p, i) => {
    p.index = i;
  });
  geometryCache.set(key, positions);
  return positions;
}

/**
 * Seats for a vote tally. Entries are ranked by votes (desc, then id asc, Others last) and fill the
 * seat order left to right, so each entry forms one wedge.
 *
 * Small tallies (`n <= chamberSeats`, default 24) don't get their own tiny arc: they take the `n`
 * slots of the fixed `hemicycleGeometry(chamberSeats)` grid nearest the centre line (so the
 * chamber fills from the middle outward as votes arrive) and `empty` lists the slots left over.
 * `n = 0` is the placeholder state: no seats, every slot empty. Larger tallies are laid out on their
 * own geometry as before, with no `chamber`.
 */
export function hemicycleSeats(
  counts: readonly { entryId: number; votes: number }[],
  opts: HemicycleOptions = {},
): HemicycleResult {
  const maxSeats = opts.maxSeats ?? MAX_SEATS;
  const groups = counts
    .map((c) => ({ entryId: c.entryId, votes: Math.floor(c.votes) }))
    .filter((c) => Number.isFinite(c.votes) && c.votes > 0);
  const n = groups.reduce((a, c) => a + c.votes, 0);
  const chamberSize = opts.chamberSeats ?? CHAMBER_SEATS;
  if (n === 0) {
    const chamber = hemicycleGeometry(chamberSize, opts.innerRadius);
    return { seats: [], perSeat: 1, placeholder: true, chamber, empty: chamber };
  }

  const perSeat = n <= maxSeats ? 1 : Math.ceil(n / maxSeats);
  groups.sort((a, b) => {
    const ao = a.entryId === OTHER_ENTRY_ID ? 1 : 0;
    const bo = b.entryId === OTHER_ENTRY_ID ? 1 : 0;
    return ao - bo || b.votes - a.votes || a.entryId - b.entryId;
  });
  const owners: number[] = [];
  for (const g of groups) {
    const seats = Math.ceil(g.votes / perSeat);
    for (let i = 0; i < seats; i++) owners.push(g.entryId);
  }
  if (owners.length <= chamberSize) {
    const chamber = hemicycleGeometry(chamberSize, opts.innerRadius);
    // Nearest the centre line first (inner row first on ties), then back into left-to-right order.
    const taken = chamber
      .map((p, slot) => ({ p, slot, off: Math.abs(p.angle - Math.PI / 2) }))
      .sort((a, b) => a.off - b.off || a.p.row - b.p.row || a.slot - b.slot)
      .slice(0, owners.length)
      .sort((a, b) => a.slot - b.slot);
    const used = new Set(taken.map((t) => t.slot));
    const seats: Seat[] = taken.map((t, i) => ({ ...t.p, index: i, entryId: owners[i] }));
    return { seats, perSeat: 1, placeholder: false, chamber, empty: chamber.filter((_, slot) => !used.has(slot)) };
  }
  const geometry = hemicycleGeometry(owners.length, opts.innerRadius);
  const seats: Seat[] = geometry.map((p, i) => ({ ...p, entryId: owners[i] }));
  return { seats, perSeat, placeholder: false, chamber: [], empty: [] };
}

// ---- colours ----------------------------------------------------------------------------------

/** 1..8 maps to --color-entry-1..8; "other" to --color-entry-other. */
export type EntryColour = number | "other";

/**
 * <= 8 live entries: stable by entry id order (lowest id = 1).
 * > 8: top 7 by votes keep or take colours 1..7 (sticky via `previous`), the rest are "other".
 */
export function assignEntryColours(
  entries: readonly { entryId: number; votes: number }[],
  previous?: ReadonlyMap<number, EntryColour>,
): Map<number, EntryColour> {
  const out = new Map<number, EntryColour>();
  if (entries.length <= PALETTE_SIZE) {
    [...entries]
      .sort((a, b) => a.entryId - b.entryId)
      .forEach((e, i) => out.set(e.entryId, i + 1));
    return out;
  }

  const ranked = [...entries].sort((a, b) => b.votes - a.votes || a.entryId - b.entryId);
  const top = ranked.slice(0, PALETTE_SIZE - 1);
  const topIds = new Set(top.map((e) => e.entryId));
  const taken = new Set<number>();

  for (const e of top) {
    const prev = previous?.get(e.entryId);
    if (typeof prev === "number" && prev >= 1 && prev <= PALETTE_SIZE - 1 && !taken.has(prev)) {
      out.set(e.entryId, prev);
      taken.add(prev);
    }
  }
  let next = 1;
  for (const e of top) {
    if (out.has(e.entryId)) continue;
    while (taken.has(next)) next++;
    out.set(e.entryId, next);
    taken.add(next);
  }
  for (const e of ranked) if (!topIds.has(e.entryId)) out.set(e.entryId, "other");
  return out;
}
