import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { EntryWithMetadata } from "@/hooks/useEntries";
import { COUNT_MS, GATHER_MS, revealOutcome } from "./reveal";
import { RevealPanel } from "./WinnerReveal";

// TxButton needs wagmi; its own tests cover the wallet states. Here it's a plain button.
vi.mock("@/components/wallet/TxButton", () => ({
  TxButton: ({ children, onClick }: { children: ReactNode; onClick: () => void }) => (
    <button type="button" onClick={onClick}>
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
  // jsdom has no canvas; the Confetti effect bails out cleanly when getContext returns null.
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const ETH = 10n ** 18n;
const idle = { status: "idle" as const, isBusy: false, error: null };
const ZERO = "0x0000000000000000000000000000000000000000" as const;

function entry(id: number, votes: number, name: string): EntryWithMetadata {
  return {
    id,
    votes,
    removed: false,
    payee: ZERO,
    submitter: ZERO,
    members: [],
    metadataURI: `ipfs://entry-${id}`,
    metadata: { version: 1, name, tagline: "", description: "" },
    metadataStatus: "ready",
  };
}

function panel({
  phase,
  entries,
  prize = ETH,
  reduced = true,
  onFinalize = () => {},
  canReplay = false,
}: {
  phase: "voting" | "ended" | "finalized";
  entries: EntryWithMetadata[];
  prize?: bigint;
  reduced?: boolean;
  onFinalize?: () => void;
  canReplay?: boolean;
}) {
  const outcome = revealOutcome({ phase, entries, prize });
  return render(
    <MotionConfig reducedMotion={reduced ? "always" : "never"}>
      <RevealPanel outcome={outcome} entries={entries} finalize={idle} onFinalize={onFinalize} canReplay={canReplay} />
    </MotionConfig>,
  );
}

const robo = entry(1, 2, "Robo Chef");
const plant = entry(2, 5, "Plant Pal");
const owl = entry(3, 5, "Night Owl");

describe("RevealPanel states", () => {
  it("renders nothing while voting is live", () => {
    const { container } = panel({ phase: "voting", entries: [robo, plant] });
    expect(container.innerHTML).toBe("");
  });

  it("ended, not finalised: Voting closed, frozen hemicycle and a Finalise button", () => {
    const onFinalize = vi.fn();
    panel({ phase: "ended", entries: [robo, plant], onFinalize });
    expect(screen.getByRole("heading", { name: "Voting closed" })).toBeTruthy();
    expect(screen.getByRole("img", { name: /Results: Plant Pal 5 votes, Robo Chef 2 votes/ })).toBeTruthy();
    // No spoiler: no winner card before the contract has decided.
    expect(screen.queryByTestId("winner-card")).toBeNull();
    expect(screen.queryByText("Winner")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Finalise and reveal/ }));
    expect(onFinalize).toHaveBeenCalledOnce();
  });

  it("finalised single winner (reduced motion): card at once, static Winner badge, no confetti", () => {
    panel({ phase: "finalized", entries: [robo, plant] });
    const card = screen.getByTestId("winner-card");
    expect(card.textContent).toContain("Winner");
    expect(card.textContent).toContain("Plant Pal");
    expect(card.textContent).toContain("71%");
    expect(screen.getByTestId("reveal-prize").textContent).toMatch(/^Takes\s*1.*ETH$/);
    expect(screen.queryByTestId("reveal-count")).toBeNull();
    expect(document.querySelector("canvas")).toBeNull();
  });

  it("finalised tie: It's a tie, every winner and the split", () => {
    panel({ phase: "finalized", entries: [robo, plant, owl], prize: 3n * ETH });
    const card = screen.getByTestId("tie-card");
    expect(screen.getByRole("heading", { name: "It's a tie" })).toBeTruthy();
    expect(card.textContent).toContain("Plant Pal");
    expect(card.textContent).toContain("Night Owl");
    expect(card.textContent).not.toContain("Robo Chef");
    expect(screen.getByTestId("reveal-prize").textContent).toMatch(/^Each takes\s*1\.5.*ETH$/);
  });

  it("finalised with no votes: the prize goes back to the organiser", () => {
    panel({ phase: "finalized", entries: [entry(1, 0, "Robo Chef")], prize: 2n * ETH });
    expect(screen.getByRole("heading", { name: "No votes" })).toBeTruthy();
    expect(screen.getByTestId("no-votes-card").textContent).toMatch(/The prize of 2 .*ETH goes back to the organiser/);
    expect(screen.queryByText("Winner")).toBeNull();
  });

  it("full motion: counts 3 · 2 · 1, gathers, then reveals; Replay starts over", () => {
    vi.useFakeTimers();
    const { container } = panel({ phase: "finalized", entries: [robo, plant], reduced: false, canReplay: true });
    const root = () => container.querySelector("[data-reveal-step]")!;
    expect(root().getAttribute("data-reveal-step")).toBe("count-3");
    expect(screen.queryByTestId("winner-card")).toBeNull();
    act(() => void vi.advanceTimersByTime(COUNT_MS));
    expect(root().getAttribute("data-reveal-step")).toBe("count-2");
    act(() => void vi.advanceTimersByTime(COUNT_MS * 2));
    expect(root().getAttribute("data-reveal-step")).toBe("gather");
    act(() => void vi.advanceTimersByTime(GATHER_MS));
    expect(root().getAttribute("data-reveal-step")).toBe("card");
    expect(screen.getByTestId("winner-card")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Replay" }));
    expect(root().getAttribute("data-reveal-step")).toBe("count-3");
  });

  it("Replay is only offered to the organiser", () => {
    panel({ phase: "finalized", entries: [robo, plant] });
    expect(screen.queryByRole("button", { name: "Replay" })).toBeNull();
  });
});
