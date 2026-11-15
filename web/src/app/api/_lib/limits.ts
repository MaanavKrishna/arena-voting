/** What `/api/upload` accepts. Mirrors docs/frontend.md "IPFS upload". */
export const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const JSON_MAX_BYTES = 64 * 1024;
export const IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const JSON_MIME = "application/json";
/** Lifetime of a signed upload URL, seconds. */
export const SIGNED_URL_SECONDS = 60;
