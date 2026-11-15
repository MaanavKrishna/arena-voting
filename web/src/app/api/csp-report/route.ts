/**
 * Receives Content Security Policy violation reports (the policy ships in report-only mode).
 * Each violation becomes one short log line in the hosting logs, so the policy can be tightened
 * and then enforced once real phones and wallets have been seen. Nothing is stored.
 */

const MAX_BYTES = 16_384;

export type Violation = { directive: string; blocked: string; page: string };

/** Report fields come from the browser, so control characters are flattened before logging. */
function text(v: unknown): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").slice(0, 200) : "";
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/** Accepts both the legacy `report-uri` body and the Reporting API (`report-to`) array. */
export function summarise(payload: unknown): Violation[] {
  if (Array.isArray(payload)) {
    return payload.flatMap((r: unknown) => {
      if (!r || typeof r !== "object") return [];
      const report = r as { type?: unknown; url?: unknown; body?: Record<string, unknown> };
      if (report.type !== "csp-violation" || !report.body) return [];
      const b = report.body;
      return [
        {
          directive: text(b.effectiveDirective ?? b.violatedDirective),
          blocked: text(b.blockedURL),
          page: pathOf(text(b.documentURL ?? report.url)),
        },
      ];
    });
  }
  if (payload && typeof payload === "object" && "csp-report" in payload) {
    const r = (payload as { "csp-report": Record<string, unknown> })["csp-report"];
    if (!r || typeof r !== "object") return [];
    return [
      {
        directive: text(r["effective-directive"] ?? r["violated-directive"]),
        blocked: text(r["blocked-uri"]),
        page: pathOf(text(r["document-uri"])),
      },
    ];
  }
  return [];
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  if (body.length > MAX_BYTES) return new Response(null, { status: 413 });
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return new Response(null, { status: 204 });
  }
  for (const v of summarise(parsed).slice(0, 20)) {
    console.warn(`[csp] ${v.directive} blocked ${v.blocked} on ${v.page}`);
  }
  return new Response(null, { status: 204 });
}
