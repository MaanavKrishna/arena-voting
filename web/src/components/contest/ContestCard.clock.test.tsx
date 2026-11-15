import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ContestView } from "@/hooks/types";
import { ContestCard } from "./ContestCard";

// The chain is 10 minutes ahead of this device: voting opened on chain, not yet by the device clock.
const deviceNow = Math.floor(Date.now() / 1000);
const chainNow = deviceNow + 600;

vi.mock("@/hooks/useChainTime", () => ({
  useChainTime: () => ({ now: BigInt(chainNow), offset: 600, skewWarning: true, ready: true }),
}));
vi.mock("@/hooks/useMetadata", () => ({
  useMetadata: () => ({ data: { version: 1, description: "" }, status: "missing" }),
}));

const contest = {
  id: 7n,
  title: "Clock check",
  metadataURI: "",
  submissionEnd: BigInt(deviceNow + 300),
  votingStart: BigInt(deviceNow + 300),
  votingEnd: BigInt(deviceNow + 3600),
  presence: 0,
  finalized: false,
  prize: 0n,
  totalVotes: 0,
} as unknown as ContestView;

describe("ContestCard clock", () => {
  it("labels the phase by chain time, not the device clock", () => {
    render(<ContestCard contest={contest} />);
    expect(screen.getByRole("link").getAttribute("aria-label") ?? screen.getByRole("link").textContent).toMatch(/Live/);
    expect(screen.queryByText(/Taking entries/)).toBeNull();
    expect(screen.queryByText(/Entries close in/)).toBeNull();
  });
});
