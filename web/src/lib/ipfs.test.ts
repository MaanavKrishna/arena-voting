import { describe, expect, it, vi } from "vitest";
import {
  E2E_GATEWAY,
  IpfsFetchError,
  extractCid,
  fetchIpfsJson,
  gatewayList,
  ipfsToHttp,
  normalizeGateway,
  parseIpfsUri,
  uploadToIpfs,
} from "./ipfs";

const CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

describe("ipfs uri helpers", () => {
  it("parses ipfs:// uris with and without a path", () => {
    expect(parseIpfsUri(`ipfs://${CID}`)).toEqual({ cid: CID, path: "" });
    expect(parseIpfsUri(`ipfs://${CID}/a/b.json`)).toEqual({ cid: CID, path: "/a/b.json" });
    expect(parseIpfsUri(CID)).toEqual({ cid: CID, path: "" });
    expect(parseIpfsUri("https://example.com/x")).toBeNull();
    expect(parseIpfsUri("")).toBeNull();
  });

  it("builds gateway urls", () => {
    expect(ipfsToHttp(`ipfs://${CID}`, "https://ipfs.io")).toBe(`https://ipfs.io/ipfs/${CID}`);
    expect(ipfsToHttp(`ipfs://${CID}/m.json`, "https://ipfs.io/")).toBe(`https://ipfs.io/ipfs/${CID}/m.json`);
    expect(ipfsToHttp(`ipfs://${CID}`, "team.mypinata.cloud")).toBe(`https://team.mypinata.cloud/ipfs/${CID}`);
    expect(ipfsToHttp(`ipfs://${CID}`, E2E_GATEWAY)).toBe(`/api/e2e-ipfs/${CID}`);
    expect(ipfsToHttp("https://x.y/z", "https://ipfs.io")).toBeNull();
  });

  it("normalises gateways", () => {
    expect(normalizeGateway("a.b.c")).toBe("https://a.b.c");
    expect(normalizeGateway("http://localhost:8080/")).toBe("http://localhost:8080");
  });

  it("orders gateways: e2e, pinata, ipfs.io, dweb.link", () => {
    expect(gatewayList({ pinata: "p.example", e2e: true })).toEqual([
      "/api/e2e-ipfs",
      "https://p.example",
      "https://ipfs.io",
      "https://dweb.link",
    ]);
    expect(gatewayList()).toEqual(["https://ipfs.io", "https://dweb.link"]);
  });
});

describe("fetchIpfsJson", () => {
  it("falls through failing gateways in order", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("no", { status: 404 }))
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: 1 })));
    const out = await fetchIpfsJson(`ipfs://${CID}`, {
      gateways: ["https://a", "https://b", "https://c"],
      fetchFn,
    });
    expect(out).toEqual({ ok: 1 });
    expect(fetchFn.mock.calls.map((c) => c[0])).toEqual([
      `https://a/ipfs/${CID}`,
      `https://b/ipfs/${CID}`,
      `https://c/ipfs/${CID}`,
    ]);
  });

  it("throws IpfsFetchError with every attempt when all fail", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response("x", { status: 500 }));
    const err = await fetchIpfsJson(`ipfs://${CID}`, { gateways: ["https://a", "https://b"], fetchFn }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(IpfsFetchError);
    expect((err as IpfsFetchError).attempts).toHaveLength(2);
  });
});

describe("uploadToIpfs", () => {
  it("requests a ticket then PUTs the json and returns ipfs://cid", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: "https://signed.example/u" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { cid: CID } })));
    const uri = await uploadToIpfs({ version: 1 }, { fetchFn });
    expect(uri).toBe(`ipfs://${CID}`);
    const [first, second] = fetchFn.mock.calls;
    expect(first[0]).toBe("/api/upload");
    expect(JSON.parse(first[1]?.body as string)).toEqual({ kind: "json", size: 13, mime: "application/json" });
    expect(second[0]).toBe("https://signed.example/u");
    expect(second[1]?.method).toBe("PUT");
  });

  it("classifies files by mime and falls back to the ticket cid", async () => {
    const file = new File([new Uint8Array(10)], "a.png", { type: "image/png" });
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: "/api/e2e-upload", cid: "abc123" })))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    expect(await uploadToIpfs(file, { fetchFn })).toBe("ipfs://abc123");
    expect(JSON.parse(fetchFn.mock.calls[0][1]?.body as string)).toEqual({
      kind: "image",
      size: 10,
      mime: "image/png",
    });
  });

  it("fails when the route refuses or no cid comes back", async () => {
    await expect(
      uploadToIpfs({}, { fetchFn: vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 413 })) }),
    ).rejects.toThrow(/refused/);
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: "https://s" })))
      .mockResolvedValueOnce(new Response("{}"));
    await expect(uploadToIpfs({}, { fetchFn })).rejects.toThrow(/no CID/);
  });

  it("extracts cids from common provider shapes", () => {
    expect(extractCid({ cid: "a" })).toBe("a");
    expect(extractCid({ IpfsHash: "b" })).toBe("b");
    expect(extractCid({ data: { cid: "c" } })).toBe("c");
    expect(extractCid(null)).toBeNull();
  });
});
