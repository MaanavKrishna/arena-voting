import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_VERSION, RELEASE_URL } from "./release";

describe("release", () => {
  it("matches the version in web/package.json", () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, "../../package.json"), "utf8")) as { version: string };
    expect(APP_VERSION).toBe(pkg.version);
  });

  it("matches the version in the root package.json", () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, "../../../package.json"), "utf8")) as { version: string };
    expect(APP_VERSION).toBe(pkg.version);
  });

  it("links to the GitHub release for this version", () => {
    expect(RELEASE_URL).toBe(`https://github.com/MaanavKrishna/arena-voting/releases/tag/v${APP_VERSION}`);
  });
});
