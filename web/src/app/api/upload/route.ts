import { PinataSDK } from "pinata";
import { z } from "zod";
import { serverEnv } from "@/config/env.server";
import { e2eIpfsEnabled } from "../_lib/e2e-ipfs";
import { isFromArena } from "../_lib/origin";
import { IMAGE_MAX_BYTES, IMAGE_MIMES, JSON_MAX_BYTES, JSON_MIME, SIGNED_URL_SECONDS } from "../_lib/limits";

/**
 * Hands out a short-lived signed upload URL so the browser can send a file straight to Pinata
 * without ever seeing our API key. The size and type limits are checked here and also baked into
 * the signed URL. Abuse controls: size/type limits, the 60 s expiry, refusing requests from
 * other sites, and a hosting firewall rule (20 requests per minute per IP on /api/upload).
 */
const Body = z.object({
  kind: z.enum(["image", "json"]),
  size: z.number().int().positive(),
  mime: z.string().min(1).max(100),
});

function problem(status: number, message: string) {
  return Response.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isFromArena(request)) return problem(403, "Uploads are only accepted from Arena itself.");
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return problem(400, "Send JSON like { kind, size, mime }.");
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return problem(400, "Send JSON like { kind, size, mime }.");
  const { kind, size } = parsed.data;
  const mime = parsed.data.mime.toLowerCase().split(";")[0].trim();

  if (kind === "image") {
    if (!(IMAGE_MIMES as readonly string[]).includes(mime)) {
      return problem(415, "Images must be PNG, JPEG, WebP or GIF.");
    }
    if (size > IMAGE_MAX_BYTES) return problem(413, "Images can be at most 4 MB.");
  } else {
    if (mime !== JSON_MIME) return problem(415, "Data must be sent as application/json.");
    if (size > JSON_MAX_BYTES) return problem(413, "Data can be at most 64 KB.");
  }

  if (e2eIpfsEnabled()) {
    // Local stand-in: the client PUTs the content here and we answer with the fake CID.
    const url = `/api/e2e-ipfs/upload?kind=${kind}&mime=${encodeURIComponent(mime)}`;
    return Response.json({ url, method: "PUT" }, { headers: { "cache-control": "no-store" } });
  }

  const jwt = serverEnv.PINATA_JWT;
  if (!jwt) return problem(503, "Uploads aren't set up on this server yet (PINATA_JWT is missing).");

  try {
    const pinata = new PinataSDK({ pinataJwt: jwt });
    const url = await pinata.upload.public.createSignedURL({
      expires: SIGNED_URL_SECONDS,
      maxFileSize: kind === "image" ? IMAGE_MAX_BYTES : JSON_MAX_BYTES,
      mimeTypes: kind === "image" ? [...IMAGE_MIMES] : [JSON_MIME],
    });
    // Pinata's signed URLs take a multipart POST with the content in a `file` field.
    return Response.json({ url, method: "POST" }, { headers: { "cache-control": "no-store" } });
  } catch {
    return problem(502, "The storage service didn't answer. Try again in a moment.");
  }
}
