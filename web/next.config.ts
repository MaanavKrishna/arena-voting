import type { NextConfig } from "next";

/**
 * Content Security Policy, shipped as Report-Only: nothing is blocked, and violations are sent to
 * /api/csp-report (one line each in the hosting logs). Once real phones and wallets have been
 * seen with no unexpected reports, rename the header to `Content-Security-Policy` to enforce it.
 * Local and dev builds (anvil, hot reload) skip the CSP entirely; the other headers always apply.
 */
const isLocalBuild = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_ANVIL === "1";

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "frame-src https://verify.walletconnect.com https://verify.walletconnect.org https://keys.coinbase.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "report-uri /api/csp-report",
  "report-to csp-endpoint",
].join("; ");

const securityHeaders = [
  ...(isLocalBuild
    ? []
    : [
        { key: "Content-Security-Policy-Report-Only", value: csp },
        { key: "Reporting-Endpoints", value: 'csp-endpoint="/api/csp-report"' },
      ]),
  // Nobody can put Arena inside a frame (clickjacking on vote / check-in buttons).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Mic (room signal) and camera (gate, QR fallback) only for this site; everything else off.
  {
    key: "Permissions-Policy",
    value: "microphone=(self), camera=(self), geolocation=(), payment=(), usb=(), bluetooth=(), interest-cohort=()",
  },
  // Wallet sign-in pop-ups (WalletConnect, Coinbase) need to keep a handle to this window.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  // wagmi's Base Account connector pulls in Coinbase SDKs with optional packages that
  // aren't installed; keep them out of the server bundle.
  serverExternalPackages: ["@base-org/account", "@coinbase/cdp-sdk"],
  // Share images (opengraph/twitter) read Geist from disk; make sure the files ship with every route.
  outputFileTracingIncludes: {
    "/**/*": ["./assets/fonts/*.ttf"],
  },
  partialPrefetching: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
