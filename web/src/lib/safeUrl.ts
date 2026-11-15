/**
 * Only lets image URLs we expect into <img src>: https gateways, local blob: previews of a file the
 * user just picked, and same-site paths (the E2E IPFS stub). Anything else (javascript:, data:,
 * protocol-relative //host, plain http) is dropped.
 */
export function safeImageSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  const u = url.trim();
  if (u.startsWith("/") && !u.startsWith("//")) return u;
  try {
    const parsed = new URL(u);
    if (parsed.protocol === "https:" || parsed.protocol === "blob:") return u;
  } catch {
    return null;
  }
  return null;
}
