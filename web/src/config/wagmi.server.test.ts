// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getConfig, withStableRandom } from "./wagmi";

describe("getConfig on the server", () => {
  it("builds a fresh config per call and puts the real Math.random back afterwards", () => {
    const real = Math.random;
    const a = getConfig();
    const b = getConfig();
    expect(a).not.toBe(b);
    expect(Math.random).toBe(real);
  });

  it("borrows a fixed value only during construction, and restores it even if construction throws", () => {
    const real = Math.random;
    expect(withStableRandom(() => Math.random())).toBe(0.5);
    expect(Math.random).toBe(real);
    expect(() =>
      withStableRandom(() => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(Math.random).toBe(real);
  });
});
