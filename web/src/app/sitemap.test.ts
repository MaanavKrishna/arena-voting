import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));

const readContract = vi.fn();
const state = { reader: true };

vi.mock("./_site/contests.server", async (importOriginal) => {
  const real = await importOriginal<typeof import("./_site/contests.server")>();
  return {
    ...real,
    serverReader: () =>
      state.reader ? { client: { readContract }, address: "0x2dC9d04Dd8f724C936aE7C200F73763e20662c34" } : null,
  };
});

import sitemap, { STATIC_ROUTES } from "./sitemap";

const BASE = "http://localhost:3000";
const staticUrls = STATIC_ROUTES.map((r) => `${BASE}${r.path === "/" ? "" : r.path}`);
const row = (id: number) => ({ id: BigInt(id), title: `Contest ${id}`, totalVotes: 0, finalized: false });

beforeEach(() => {
  readContract.mockReset();
  state.reader = true;
  vi.unstubAllEnvs();
  vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
});

describe("sitemap", () => {
  it("lists the static pages plus one URL per contest when the chain read succeeds", async () => {
    readContract.mockResolvedValueOnce([row(3), row(2), row(1)]);
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toEqual([...staticUrls, `${BASE}/c/3`, `${BASE}/c/2`, `${BASE}/c/1`]);
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "getContests", args: [0n, 50n] }),
    );
  });

  it("pages through getContests in steps of 50 until a short page", async () => {
    const full = Array.from({ length: 50 }, (_, i) => row(60 - i));
    readContract.mockResolvedValueOnce(full).mockResolvedValueOnce([row(10), row(9)]);
    const urls = (await sitemap()).map((e) => e.url).filter((u) => u.includes("/c/"));
    expect(urls).toHaveLength(52);
    expect(readContract).toHaveBeenNthCalledWith(2, expect.objectContaining({ args: [50n, 50n] }));
  });

  it("falls back to the static pages when the RPC fails", async () => {
    readContract.mockRejectedValueOnce(new Error("rpc down"));
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toEqual(staticUrls);
  });

  it("falls back to the static pages when the RPC hangs past the deadline", async () => {
    vi.useFakeTimers();
    readContract.mockReturnValueOnce(new Promise(() => {}));
    const pending = sitemap();
    await vi.advanceTimersByTimeAsync(10_000);
    const urls = (await pending).map((e) => e.url);
    vi.useRealTimers();
    expect(urls).toEqual(staticUrls);
  });

  it("falls back to the static pages when no RPC or deployment is configured", async () => {
    state.reader = false;
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toEqual(staticUrls);
    expect(readContract).not.toHaveBeenCalled();
  });

  it("uses the production host when Vercel provides one", async () => {
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "arena-voting.vercel.app");
    readContract.mockResolvedValueOnce([row(1)]);
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls[0]).toBe("https://arena-voting.vercel.app");
    expect(urls.at(-1)).toBe("https://arena-voting.vercel.app/c/1");
  });

  it("never lists kiosk, organiser or personal pages", async () => {
    readContract.mockResolvedValueOnce([row(1)]);
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.some((u) => /\/(gate|stage|manage|me)$|\/api\//.test(u))).toBe(false);
  });
});
