import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { E2E_CID_PATTERN, E2E_IPFS_DIR, e2eCid, e2eIpfsEnabled } from "../../_lib/e2e-ipfs";
import { IMAGE_MAX_BYTES, IMAGE_MIMES, JSON_MAX_BYTES, JSON_MIME } from "../../_lib/limits";

/**
 * E2E-only IPFS stand-in (`isE2E`: NEXT_PUBLIC_E2E=1 with the local chain).
 *   PUT /api/e2e-ipfs/upload?kind=&mime=   stores the body, answers { cid }
 *   GET /api/e2e-ipfs/<cid>                serves it back
 */
const notFound = () => new NextResponse("Not found", { status: 404 });

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/e2e-ipfs/[cid]">) {
  if (!e2eIpfsEnabled()) return notFound();
  const { cid } = await ctx.params;
  if (!E2E_CID_PATTERN.test(cid)) return notFound();
  try {
    const [body, mime] = await Promise.all([
      readFile(path.join(E2E_IPFS_DIR, cid)),
      readFile(path.join(E2E_IPFS_DIR, `${cid}.mime`), "utf8").catch(() => "application/octet-stream"),
    ]);
    return new NextResponse(new Uint8Array(body), {
      headers: { "content-type": mime, "cache-control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return notFound();
  }
}

export async function PUT(req: NextRequest, ctx: RouteContext<"/api/e2e-ipfs/[cid]">) {
  if (!e2eIpfsEnabled()) return notFound();
  const { cid } = await ctx.params;
  if (cid !== "upload") return notFound();

  const kind = req.nextUrl.searchParams.get("kind");
  const mime = (req.nextUrl.searchParams.get("mime") ?? "").toLowerCase();
  const allowed = kind === "image" ? (IMAGE_MIMES as readonly string[]).includes(mime) : kind === "json" && mime === JSON_MIME;
  if (!allowed) return NextResponse.json({ error: "Unsupported type" }, { status: 415 });

  const body = new Uint8Array(await req.arrayBuffer());
  if (body.length === 0 || body.length > (kind === "image" ? IMAGE_MAX_BYTES : JSON_MAX_BYTES)) {
    return NextResponse.json({ error: "Bad size" }, { status: 413 });
  }
  const id = e2eCid(body);
  await mkdir(E2E_IPFS_DIR, { recursive: true });
  await Promise.all([writeFile(path.join(E2E_IPFS_DIR, id), body), writeFile(path.join(E2E_IPFS_DIR, `${id}.mime`), mime)]);
  return NextResponse.json({ cid: id });
}
