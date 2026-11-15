import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "./robots";

afterEach(() => vi.unstubAllEnvs());

describe("robots", () => {
  it("allows everything except the API, kiosk screens, the control room and /me, and points at the sitemap", () => {
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "arena-voting.vercel.app");
    expect(robots()).toEqual({
      rules: {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/c/*/gate", "/c/*/stage", "/c/*/manage", "/me"],
      },
      sitemap: "https://arena-voting.vercel.app/sitemap.xml",
      host: "https://arena-voting.vercel.app",
    });
  });

  it("falls back to the local dev server without a production host", () => {
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    expect(robots().sitemap).toBe("http://localhost:3000/sitemap.xml");
  });
});
