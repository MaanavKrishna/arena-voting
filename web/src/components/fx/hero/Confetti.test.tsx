import { cleanup, render, screen } from "@testing-library/react";
import { MotionConfig } from "motion/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CONFETTI_COUNT, Confetti, confettiAlpha, makeParticles, stepParticle } from "./Confetti";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Confetti", () => {
  it("reduced motion: draws nothing and shows the static fallback instead", () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext");
    render(
      <MotionConfig reducedMotion="always">
        <Confetti colours={["var(--color-entry-1)"]} fallback={<span>Winner</span>} />
      </MotionConfig>,
    );
    expect(screen.getByText("Winner")).toBeTruthy();
    expect(document.querySelector("canvas")).toBeNull();
    expect(getContext).not.toHaveBeenCalled();
  });

  it("full motion: one pointer-transparent canvas over the viewport, removed on unmount", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const onDone = vi.fn();
    const { unmount } = render(
      <MotionConfig reducedMotion="never">
        <Confetti colours={["var(--color-entry-1)"]} fallback={<span>Winner</span>} onDone={onDone} />
      </MotionConfig>,
    );
    const canvas = screen.getByTestId("confetti");
    expect(canvas.className).toContain("pointer-events-none");
    expect(canvas.className).toContain("fixed");
    expect(screen.queryByText("Winner")).toBeNull();
    // No 2D context (jsdom): it gives up at once instead of hanging.
    expect(onDone).toHaveBeenCalledOnce();
    unmount();
    expect(document.querySelector("canvas")).toBeNull();
  });
});

describe("confetti physics", () => {
  it("makes 120 particles by default, cycling through the entry colours", () => {
    let i = 0;
    const rand = () => ((i = (i * 9301 + 49297) % 233280), i / 233280);
    const ps = makeParticles(CONFETTI_COUNT, { x: 100, y: 100 }, ["a", "b", "c"], 1, rand);
    expect(ps).toHaveLength(120);
    expect(new Set(ps.map((p) => p.colour))).toEqual(new Set(["a", "b", "c"]));
    // The burst goes up.
    expect(ps.every((p) => p.vy < 0)).toBe(true);
  });

  it("gravity eventually wins", () => {
    const [p] = makeParticles(1, { x: 0, y: 0 }, ["a"], 1, () => 0.5);
    for (let t = 0; t < 1800; t += 16) stepParticle(p!, 16, 1);
    expect(p!.vy).toBeGreaterThan(0);
  });

  it("fades out over the last third and is gone at the end", () => {
    expect(confettiAlpha(0.2)).toBe(1);
    expect(confettiAlpha(0.8)).toBeGreaterThan(0);
    expect(confettiAlpha(0.8)).toBeLessThan(1);
    expect(confettiAlpha(1)).toBe(0);
  });
});
