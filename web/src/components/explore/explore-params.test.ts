import { describe, expect, it } from "vitest";
import { buildExploreHref, parseTab } from "./explore-params";

describe("explore params", () => {
  it("falls back to live for missing or unknown tabs", () => {
    expect(parseTab(null)).toBe("live");
    expect(parseTab("nope")).toBe("live");
    expect(parseTab("ended")).toBe("ended");
  });
  it("omits defaults and encodes the search", () => {
    expect(buildExploreHref("live", "")).toBe("/explore");
    expect(buildExploreHref("upcoming", "")).toBe("/explore?tab=upcoming");
    expect(buildExploreHref("live", " demo day ")).toBe("/explore?q=demo+day");
    expect(buildExploreHref("ended", "a&b")).toBe("/explore?tab=ended&q=a%26b");
  });
});
