import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const createSignedURL = vi.fn();
vi.mock("pinata", () => ({
  PinataSDK: vi.fn(function PinataSDK() {
    return { upload: { public: { createSignedURL } } };
  }),
}));

const state = { jwt: "jwt" as string | undefined, e2e: false };
vi.mock("@/config/env.server", () => ({
  serverEnv: {
    get PINATA_JWT() {
      return state.jwt;
    },
  },
}));
vi.mock("../_lib/e2e-ipfs", () => ({ e2eIpfsEnabled: () => state.e2e }));

import { POST } from "./route";

const HOST = "https://arena-preview.example";
const call = (body: unknown, headers: Record<string, string> = { origin: HOST }) =>
  POST(
    new Request(`${HOST}/api/upload`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
const ok = { kind: "json", size: 10, mime: "application/json" };

beforeEach(() => {
  vi.unstubAllEnvs();
  state.jwt = "jwt";
  state.e2e = false;
  createSignedURL.mockReset().mockResolvedValue("https://uploads.pinata.cloud/signed");
});

describe("POST /api/upload", () => {
  it("signs a 60 s image upload limited to 4 MB and image types", async () => {
    const res = await call({ kind: "image", size: 1000, mime: "image/png" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://uploads.pinata.cloud/signed", method: "POST" });
    expect(createSignedURL).toHaveBeenCalledWith({
      expires: 60,
      maxFileSize: 4 * 1024 * 1024,
      mimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
    });
  });

  it("signs a JSON upload limited to 64 KB", async () => {
    const res = await call({ kind: "json", size: 500, mime: "application/json" });
    expect(res.status).toBe(200);
    expect(createSignedURL).toHaveBeenCalledWith({ expires: 60, maxFileSize: 64 * 1024, mimeTypes: ["application/json"] });
  });

  it("rejects oversize files", async () => {
    expect((await call({ kind: "image", size: 4 * 1024 * 1024 + 1, mime: "image/png" })).status).toBe(413);
    expect((await call({ kind: "json", size: 64 * 1024 + 1, mime: "application/json" })).status).toBe(413);
    expect(createSignedURL).not.toHaveBeenCalled();
  });

  it("rejects the wrong MIME type", async () => {
    expect((await call({ kind: "image", size: 10, mime: "image/svg+xml" })).status).toBe(415);
    expect((await call({ kind: "image", size: 10, mime: "application/json" })).status).toBe(415);
    expect((await call({ kind: "json", size: 10, mime: "text/html" })).status).toBe(415);
    expect(createSignedURL).not.toHaveBeenCalled();
  });

  it("rejects malformed bodies", async () => {
    expect((await call("not json")).status).toBe(400);
    expect((await call({ kind: "video", size: 10, mime: "video/mp4" })).status).toBe(400);
    expect((await call({ kind: "json", size: -1, mime: "application/json" })).status).toBe(400);
  });

  it("answers 503 with a clear message when PINATA_JWT is missing", async () => {
    state.jwt = undefined;
    const res = await call({ kind: "json", size: 10, mime: "application/json" });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/PINATA_JWT/);
  });

  it("answers 502 when the storage service fails", async () => {
    createSignedURL.mockRejectedValue(new Error("boom"));
    expect((await call({ kind: "json", size: 10, mime: "application/json" })).status).toBe(502);
  });

  it("points at the local e2e route in E2E mode, without touching Pinata or needing a JWT", async () => {
    state.e2e = true;
    state.jwt = undefined;
    const res = await call({ kind: "image", size: 10, mime: "image/webp" });
    expect(await res.json()).toEqual({ url: "/api/e2e-ipfs/upload?kind=image&mime=image%2Fwebp", method: "PUT" });
    expect(createSignedURL).not.toHaveBeenCalled();
  });
});

describe("POST /api/upload: only from Arena itself", () => {
  const refused = async (res: Response) => {
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Uploads are only accepted from Arena itself." });
    expect(createSignedURL).not.toHaveBeenCalled();
  };

  it("accepts the request's own origin, or its referer when there's no Origin header", async () => {
    expect((await call(ok, { origin: HOST })).status).toBe(200);
    expect((await call(ok, { referer: `${HOST}/create?step=2` })).status).toBe(200);
  });

  it("accepts the production host", async () => {
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "arena-voting.example");
    expect((await call(ok, { origin: "https://arena-voting.example" })).status).toBe(200);
  });

  it("refuses another site", async () => {
    await refused(await call(ok, { origin: "https://evil.example" }));
    await refused(await call(ok, { referer: "https://evil.example/page" }));
    await refused(await call(ok, { origin: "https://arena-preview.example.evil.example" }));
    await refused(await call(ok, { origin: "null" }));
  });

  it("refuses a request with neither Origin nor Referer", async () => {
    await refused(await call(ok, {}));
  });

  it("allows http://localhost:3000 only outside production", async () => {
    expect((await call(ok, { origin: "http://localhost:3000" })).status).toBe(200);
    createSignedURL.mockClear();
    vi.stubEnv("VERCEL_ENV", "production");
    await refused(await call(ok, { origin: "http://localhost:3000" }));
  });

  it("checks the origin before reading the body", async () => {
    await refused(await call("not json", { origin: "https://evil.example" }));
  });
});
