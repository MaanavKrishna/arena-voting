import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("merges conflicting tailwind classes", () => {
    expect(cn("p-2", "p-4", false && "hidden")).toBe("p-4");
  });
});
