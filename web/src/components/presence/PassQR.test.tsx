import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PASS_QR_MIN_SIZE, PassQR } from "./PassQR";
import { passTimeLeft } from "./GetPassPanel";

afterEach(cleanup);

const TEXT = "arena:p1:" + "A".repeat(250);

describe("PassQR", () => {
  it("draws the pass as an accessible QR on a light card", () => {
    const { container } = render(<PassQR value={TEXT} />);
    const svg = screen.getByRole("img");
    expect(svg.getAttribute("aria-label")).toMatch(/door pass/i);
    expect(container.querySelector("figure")?.getAttribute("data-theme")).toBe("light");
  });

  it("never draws smaller than 280 px", () => {
    render(<PassQR value={TEXT} size={120} />);
    expect(Number(screen.getByRole("img").getAttribute("width"))).toBe(PASS_QR_MIN_SIZE);
  });

  it("changes the code when the value changes", () => {
    const { rerender } = render(<PassQR value={TEXT} />);
    const a = screen.getByRole("img").innerHTML;
    rerender(<PassQR value={"arena:p1:" + "B".repeat(250)} />);
    expect(screen.getByRole("img").innerHTML).not.toBe(a);
  });
});

describe("passTimeLeft", () => {
  it("counts down in minutes and stops 20 s before the gate's 10-minute limit", () => {
    expect(passTimeLeft(1000n, 1000n)).toBe("10 min left");
    expect(passTimeLeft(1000n, 1000n + 300n)).toBe("5 min left");
    expect(passTimeLeft(1000n, 1000n + 550n)).toBe("Less than a minute left");
    expect(passTimeLeft(1000n, 1000n + 580n)).toBe("Expired");
  });
});
