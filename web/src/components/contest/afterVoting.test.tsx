import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { EntryColour } from "@/lib/hemicycle";
import { ClaimCard, FinalizeCard } from "./ActionCards";
import { EntryCard } from "./EntryCard";
import { ResultsPanel } from "./ResultsPanel";
import { shareOf, winnersOf } from "./contestLogic";

// TxButton needs wagmi; its own tests cover the wallet states. Here it's a plain button.
vi.mock("@/components/wallet/TxButton", () => ({
  TxButton: ({ children, onClick, disabledReason }: { children: ReactNode; onClick: () => void; disabledReason?: string | null }) => (
    <button type="button" onClick={onClick} disabled={!!disabledReason}>
      {children}
    </button>
  ),
}));

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
afterEach(cleanup);

const idle = { status: "idle" as const, isBusy: false, error: null };
const names = new Map([
  [1, "Robo Chef"],
  [2, "Plant Pal"],
  [3, "Night Owl"],
]);
const colours = new Map<number, EntryColour>([
  [1, 1],
  [2, 2],
  [3, 3],
]);

function panel(entries: { id: number; votes: number }[], prize = 10n ** 19n) {
  const list = entries.map((e) => ({ ...e, removed: false }));
  const winners = winnersOf(list);
  const rows = [...list]
    .sort((a, b) => b.votes - a.votes || a.id - b.id)
    .map((e, i) => ({
      entryId: e.id,
      name: names.get(e.id)!,
      votes: e.votes,
      rank: i + 1,
      colour: colours.get(e.id),
      winner: winners.includes(e.id),
    }));
  return render(
    <ResultsPanel
      phase="finalized"
      rows={rows}
      counts={list.map((e) => ({ entryId: e.id, votes: e.votes }))}
      colours={colours}
      names={names}
      total={list.reduce((a, e) => a + e.votes, 0)}
      winners={winners}
      share={shareOf(prize, winners.length)}
      holdEntry={null}
      onSelect={() => {}}
    />,
  );
}

describe("finalised results", () => {
  it("names the single winner and their share", () => {
    panel([
      { id: 1, votes: 2 },
      { id: 2, votes: 5 },
    ]);
    expect(screen.getByRole("heading", { name: "Final results" })).toBeTruthy();
    expect(screen.getByText(/Winner:/).textContent).toBe("Winner: Plant Pal");
    expect(screen.getByText(/Takes/).textContent).toMatch(/^Takes 10 \S+ ETH$/);
    expect(screen.getByLabelText("Winner").closest("li")?.dataset.entry).toBe("2");
    expect(screen.queryByText("Updating live")).toBeNull();
  });

  it("lists tied winners and says each takes a share", () => {
    panel([
      { id: 1, votes: 4 },
      { id: 2, votes: 4 },
      { id: 3, votes: 4 },
    ]);
    expect(screen.getByText(/Tied winners:/).textContent).toBe("Tied winners: Robo Chef, Plant Pal and Night Owl");
    expect(screen.getByText(/Each takes/)).toBeTruthy();
    expect(screen.getAllByLabelText("Winner")).toHaveLength(3);
  });

  it("explains the refund when nobody voted", () => {
    panel([
      { id: 1, votes: 0 },
      { id: 2, votes: 0 },
    ]);
    expect(screen.getByText("No votes were cast, so the prize went back to the organiser.")).toBeTruthy();
    expect(screen.getByTestId("hemicycle-empty")).toBeTruthy();
  });
});

describe("action cards", () => {
  it("lets anyone finalise once voting has closed", () => {
    const onFinalize = vi.fn();
    render(<FinalizeCard action={idle} onFinalize={onFinalize} />);
    expect(screen.getByRole("heading", { name: "Voting has closed" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Finalise results" }));
    expect(onFinalize).toHaveBeenCalledOnce();
  });

  it("shows the winner what they can collect", () => {
    const onClaim = vi.fn();
    render(<ClaimCard amount={25_000_000_000_000_000n} action={idle} onClaim={onClaim} />);
    expect(screen.getByRole("heading", { name: "Your prize is ready" })).toBeTruthy();
    expect(screen.getByText(/0\.025/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Collect prize" }));
    expect(onClaim).toHaveBeenCalledOnce();
  });

  it("words a refund to the organiser differently", () => {
    render(<ClaimCard amount={1n} action={idle} onClaim={() => {}} refund />);
    expect(screen.getByRole("heading", { name: "Money to collect" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Collect" })).toBeTruthy();
  });
});

describe("EntryCard states", () => {
  const base = { entryId: 4, name: "Robo Chef", tagline: "Cooks", image: undefined, votes: 3, color: "var(--color-entry-1)", onOpen: () => {} };
  it.each([
    ["confirm", "Confirm in wallet"],
    ["sending", "Sending…"],
    ["voted", "Your vote"],
  ] as const)("shows %s", (voteState, text) => {
    render(<EntryCard {...base} voteState={voteState} />);
    expect(screen.getByText(text)).toBeTruthy();
  });
  it("marks the winner and opens on tap", () => {
    const onOpen = vi.fn();
    render(<EntryCard {...base} winner onOpen={onOpen} />);
    const card = screen.getByRole("button", { name: "Robo Chef, 3 votes, winner" });
    expect(screen.getByText("Winner")).toBeTruthy();
    fireEvent.click(card);
    expect(onOpen).toHaveBeenCalledOnce();
  });
});
