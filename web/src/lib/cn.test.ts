import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("merges conflicting tailwind classes", () => {
    expect(cn("p-2", "p-4", false && "hidden")).toBe("p-4");
  });
});

describe("cn with type tokens", () => {
  it("keeps a type utility next to a colour utility", () => {
    expect(cn("text-body", "text-fg")).toBe("text-body text-fg");
  });
});
