/**
 * Same-site check for state-changing API routes. Browsers send `Origin` on every POST (and a
 * `Referer` when they don't), so a page on another site can't use these routes through a
 * visitor's browser. Allowed: the request's own host, the production host
 * (`VERCEL_PROJECT_PRODUCTION_URL`), and http://localhost:3000 outside production.
 */
export type OriginPolicy = {
  /** Production host without a scheme, e.g. `arena.example`. */
  productionHost?: string;
  allowLocalhost: boolean;
};

const LOCAL_DEV_ORIGIN = "http://localhost:3000";

export function originPolicy(): OriginPolicy {
  return {
    productionHost: process.env.VERCEL_PROJECT_PRODUCTION_URL || undefined,
    allowLocalhost: process.env.VERCEL_ENV !== "production",
  };
}

function originOf(value: string | null): string | null {
  if (!value || value === "null") return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
  } catch {
    return null;
  }
}

/** The caller's origin: `Origin`, or the origin of `Referer` when there's no `Origin` header. */
export function requestSource(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (origin !== null) return originOf(origin);
  return originOf(request.headers.get("referer"));
}

export function isFromArena(request: Request, policy: OriginPolicy = originPolicy()): boolean {
  const source = requestSource(request);
  if (!source) return false;
  const host = new URL(source).host.toLowerCase();

  const own = new Set<string>([new URL(request.url).host.toLowerCase()]);
  const hostHeader = request.headers.get("host");
  if (hostHeader) own.add(hostHeader.toLowerCase());
  if (own.has(host)) return true;

  if (policy.productionHost && source === `https://${policy.productionHost.toLowerCase().replace(/\/+$/, "")}`) return true;
  return policy.allowLocalhost && source === LOCAL_DEV_ORIGIN;
}
