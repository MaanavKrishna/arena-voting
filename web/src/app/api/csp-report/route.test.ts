import { afterEach, describe, expect, it, vi } from "vitest";
import { POST, summarise } from "./route";

const legacy = {
  "csp-report": {
    "document-uri": "https://arena-voting.vercel.app/c/1",
    "violated-directive": "connect-src",
    "effective-directive": "connect-src",
    "blocked-uri": "https://evil.example/x",
  },
};
const modern = [
  {
    type: "csp-violation",
    url: "https://arena-voting.vercel.app/c/1/stage",
    body: { effectiveDirective: "script-src-elem", blockedURL: "eval", documentURL: "https://arena-voting.vercel.app/c/1/stage" },
  },
];

function req(body: string, type: string) {
  return new Request("https://arena-voting.vercel.app/api/csp-report", { method: "POST", body, headers: { "content-type": type } });
}

afterEach(() => vi.restoreAllMocks());

describe("summarise", () => {
  it("reads the legacy report-uri format", () => {
    expect(summarise(legacy)).toEqual([{ directive: "connect-src", blocked: "https://evil.example/x", page: "/c/1" }]);
  });
  it("reads the Reporting API format and ignores other report types", () => {
    expect(summarise([...modern, { type: "deprecation", body: {} }])).toEqual([
      { directive: "script-src-elem", blocked: "eval", page: "/c/1/stage" },
    ]);
  });
  it("returns nothing for junk", () => {
    expect(summarise("nope")).toEqual([]);
    expect(summarise({ foo: 1 })).toEqual([]);
  });
});

describe("POST /api/csp-report", () => {
  it("logs one line per violation and answers 204", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await POST(req(JSON.stringify(legacy), "application/csp-report"));
    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledWith("[csp] connect-src blocked https://evil.example/x on /c/1");
  });
  it("refuses bodies over 16 KB", async () => {
    const res = await POST(req("x".repeat(17_000), "application/reports+json"));
    expect(res.status).toBe(413);
  });
  it("answers 204 for unreadable JSON without logging", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await POST(req("{not json", "application/csp-report"));
    expect(res.status).toBe(204);
    expect(warn).not.toHaveBeenCalled();
  });
});
