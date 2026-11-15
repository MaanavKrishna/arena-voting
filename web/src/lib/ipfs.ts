import { z } from "zod";
import { env } from "@/config/env";
import { isE2E } from "@/config/network";

/** Local stand-in for the IPFS gateways, served by `/api/e2e-ipfs/[cid]` in E2E mode. */
export const E2E_GATEWAY = "/api/e2e-ipfs";
export const PUBLIC_GATEWAYS = ["https://ipfs.io", "https://dweb.link"] as const;
const FETCH_TIMEOUT_MS = 8_000;

export type ParsedIpfs = { cid: string; path: string };

/**
 * True when a path stays inside its CID: no `.` or `..` segments (also percent-encoded), and no
 * backslashes (some servers treat them as `/`). Gateways resolve dot segments, so `ipfs://x/../..`
 * would otherwise point at a different path on the gateway host.
 */
export function isSafeIpfsPath(path: string): boolean {
  if (/\\|%5c/i.test(path)) return false;
  return path
    .split("/")
    .every((seg) => {
      const s = seg.replace(/%2e/gi, ".");
      return s !== "." && s !== "..";
    });
}

/** Splits `ipfs://<cid>[/path]` (also bare `<cid>[/path]`). `null` for anything else, or an unsafe path. */
export function parseIpfsUri(uri: string): ParsedIpfs | null {
  const m = /^(?:ipfs:\/\/)?([A-Za-z0-9]{1,128})(\/[^\s?#]*)?$/.exec(uri.trim());
  if (!m) return null;
  const path = m[2] ?? "";
  if (!isSafeIpfsPath(path)) return null;
  return { cid: m[1], path };
}

/** Accepts `my.mypinata.cloud` or a full URL; returns a base URL with no trailing slash. */
export function normalizeGateway(gateway: string): string {
  const g = gateway.trim().replace(/\/+$/, "");
  if (g.startsWith("/") || /^https?:\/\//i.test(g)) return g;
  return `https://${g}`;
}

/** `ipfs://<cid>/x` → `<gateway>/ipfs/<cid>/x`. `null` when `uri` isn't an IPFS URI. */
export function ipfsToHttp(uri: string, gateway: string): string | null {
  const parsed = parseIpfsUri(uri);
  if (!parsed) return null;
  const base = normalizeGateway(gateway);
  return base === E2E_GATEWAY
    ? `${base}/${parsed.cid}${parsed.path}`
    : `${base}/ipfs/${parsed.cid}${parsed.path}`;
}

/** Gateways in the order to try them: local E2E route, dedicated Pinata, then public ones. */
export function gatewayList(opts: { pinata?: string; e2e?: boolean } = {}): string[] {
  const out: string[] = [];
  if (opts.e2e) out.push(E2E_GATEWAY);
  if (opts.pinata) out.push(normalizeGateway(opts.pinata));
  out.push(...PUBLIC_GATEWAYS);
  return out;
}

export function defaultGateways(): string[] {
  return gatewayList({ pinata: env.NEXT_PUBLIC_PINATA_GATEWAY, e2e: isE2E });
}

/** URL for displaying an image or file: the first configured gateway. */
export function ipfsDisplayUrl(uri: string): string | null {
  return ipfsToHttp(uri, defaultGateways()[0]);
}

export class IpfsFetchError extends Error {
  override name = "IpfsFetchError";
  constructor(
    message: string,
    readonly attempts: { url: string; reason: string }[] = [],
  ) {
    super(message);
  }
}

/** Fetches JSON for an IPFS URI, trying each gateway in turn. Throws `IpfsFetchError` if all fail. */
export async function fetchIpfsJson(
  uri: string,
  opts: { gateways?: string[]; fetchFn?: typeof fetch; timeoutMs?: number } = {},
): Promise<unknown> {
  const gateways = opts.gateways ?? defaultGateways();
  const fetchFn = opts.fetchFn ?? fetch;
  const attempts: { url: string; reason: string }[] = [];
  for (const gw of gateways) {
    const url = ipfsToHttp(uri, gw);
    if (!url) throw new IpfsFetchError(`Not an IPFS URI: ${uri}`);
    try {
      const res = await fetchFn(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? FETCH_TIMEOUT_MS) });
      if (!res.ok) {
        attempts.push({ url, reason: `HTTP ${res.status}` });
        continue;
      }
      return await res.json();
    } catch (err) {
      attempts.push({ url, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  throw new IpfsFetchError(`Could not load ${uri} from any gateway`, attempts);
}

// ---- upload ----

const UploadTicket = z.object({
  url: z.string().min(1),
  cid: z.string().optional(),
  method: z.enum(["PUT", "POST"]).optional(),
});

export type UploadKind = "image" | "json";

/** `kind`, size and MIME as the upload route validates them. */
export function describeUpload(input: File | Blob | unknown): {
  body: Blob;
  kind: UploadKind;
  mime: string;
} {
  if (typeof Blob !== "undefined" && input instanceof Blob) {
    const mime = input.type || "application/octet-stream";
    return { body: input, kind: mime.startsWith("image/") ? "image" : "json", mime };
  }
  const text = JSON.stringify(input);
  if (text === undefined) throw new TypeError("Nothing to upload");
  return { body: new Blob([text], { type: "application/json" }), kind: "json", mime: "application/json" };
}

/** Finds the CID in whatever the storage provider answered with. */
export function extractCid(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  for (const key of ["cid", "IpfsHash", "Hash"]) {
    if (typeof o[key] === "string" && o[key]) return o[key] as string;
  }
  return o.data ? extractCid(o.data) : null;
}

/**
 * Uploads a file or a JSON-serialisable value to IPFS and returns `ipfs://<cid>`.
 * `POST /api/upload { kind, size, mime }` → `{ url, cid?, method? }` (a short-lived signed URL, with
 * the CID when it's known up front), then the content goes straight to that URL (`PUT` by default).
 */
export async function uploadToIpfs(
  input: File | Blob | unknown,
  opts: { fetchFn?: typeof fetch; endpoint?: string } = {},
): Promise<string> {
  const fetchFn = opts.fetchFn ?? fetch;
  const { body, kind, mime } = describeUpload(input);

  const ticketRes = await fetchFn(opts.endpoint ?? "/api/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, size: body.size, mime }),
  });
  if (!ticketRes.ok) throw new Error(`Upload was refused (HTTP ${ticketRes.status})`);
  const ticket = UploadTicket.parse(await ticketRes.json());

  const method = ticket.method ?? "PUT";
  let init: RequestInit;
  if (method === "POST") {
    const form = new FormData();
    form.append("file", body);
    init = { method, body: form };
  } else {
    init = { method, headers: { "content-type": mime }, body };
  }
  const putRes = await fetchFn(ticket.url, init);
  if (!putRes.ok) throw new Error(`Upload failed (HTTP ${putRes.status})`);

  let responseCid: string | null = null;
  try {
    responseCid = extractCid(await putRes.json());
  } catch {
    // some providers answer with an empty body
  }
  const cid = responseCid ?? ticket.cid;
  if (!cid) throw new Error("Upload finished but no CID was returned");
  return `ipfs://${cid}`;
}
