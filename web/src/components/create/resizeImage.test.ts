import { describe, expect, it } from "vitest";
import { fitWithin, prepareImage } from "./resizeImage";

describe("fitWithin", () => {
  it("scales the longest side down to the max, keeping the ratio", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(1600, 900)).toEqual({ width: 1600, height: 900 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(10_000, 1)).toEqual({ width: 1600, height: 1 });
  });
});

describe("prepareImage", () => {
  it("refuses other file types before decoding", async () => {
    const svg = new File(["<svg/>"], "x.svg", { type: "image/svg+xml" });
    await expect(prepareImage(svg)).rejects.toThrow(/PNG, JPEG, WebP or GIF/);
  });
});
