import { describe, expect, it } from "vitest";
import { safeImageSrc } from "./safeUrl";

describe("safeImageSrc", () => {
  it("keeps https gateway URLs, local blob previews and same-site paths", () => {
    expect(safeImageSrc("https://gw.mypinata.cloud/ipfs/bafy")).toBe("https://gw.mypinata.cloud/ipfs/bafy");
    expect(safeImageSrc("blob:https://arena-voting.vercel.app/1234")).toBe("blob:https://arena-voting.vercel.app/1234");
    expect(safeImageSrc("/api/e2e-ipfs/bafe2eabc")).toBe("/api/e2e-ipfs/bafe2eabc");
  });
  it("drops script, data, protocol-relative and plain-http URLs", () => {
    expect(safeImageSrc("javascript:alert(1)")).toBeNull();
    expect(safeImageSrc(" JaVaScRiPt:alert(1)")).toBeNull();
    expect(safeImageSrc("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeImageSrc("//evil.example/x.png")).toBeNull();
    expect(safeImageSrc("http://evil.example/x.png")).toBeNull();
    expect(safeImageSrc("")).toBeNull();
    expect(safeImageSrc(null)).toBeNull();
  });
});
