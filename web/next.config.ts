import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // wagmi's Base Account connector pulls in Coinbase SDKs with optional packages that
  // aren't installed; keep them out of the server bundle.
  serverExternalPackages: ["@base-org/account", "@coinbase/cdp-sdk"],
  // Share images (opengraph/twitter) read Geist from disk; make sure the files ship with every route.
  outputFileTracingIncludes: {
    "/**/*": ["./assets/fonts/*.ttf"],
  },
  partialPrefetching: true,
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
