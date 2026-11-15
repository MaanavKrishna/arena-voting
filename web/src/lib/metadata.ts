import { z } from "zod";
import { byteLength } from "./format";

// Off-chain JSON (docs/contracts.md "Off-chain JSON"). All string limits are UTF-8 bytes.

function bytes(min: number, max: number) {
  return z
    .string()
    .refine((s) => byteLength(s) >= min && byteLength(s) <= max, {
      message: min > 0 ? `must be ${min}..${max} bytes` : `must be at most ${max} bytes`,
    });
}

const ipfsUri = z.string().refine((s) => /^ipfs:\/\/[A-Za-z0-9]{1,128}(\/\S*)?$/.test(s), {
  message: "must be an ipfs:// URI",
});

const httpsUrl = bytes(1, 200).refine(
  (s) => {
    try {
      return new URL(s).protocol === "https:" && s.toLowerCase().startsWith("https://");
    } catch {
      return false;
    }
  },
  { message: "must be an https URL" },
);

const Link = z.object({ label: bytes(1, 40), url: httpsUrl });
const Links = z.array(Link).max(4);

export const ContestMetadata = z.object({
  version: z.literal(1),
  description: bytes(0, 1000),
  cover: ipfsUri.optional(),
  links: Links.optional(),
});
export type ContestMetadata = z.infer<typeof ContestMetadata>;

export const EntryMetadata = z.object({
  version: z.literal(1),
  name: bytes(1, 60),
  tagline: bytes(0, 120),
  description: bytes(0, 1000),
  image: ipfsUri.optional(),
  links: Links.optional(),
});
export type EntryMetadata = z.infer<typeof EntryMetadata>;

export const TicketList = z.object({
  version: z.literal(1),
  format: z.literal("oz-standard-merkle-tree"),
  tree: z.object({}).catchall(z.unknown()),
});
export type TicketList = z.infer<typeof TicketList>;

export const UNTITLED_ENTRY: EntryMetadata = {
  version: 1,
  name: "Untitled entry",
  tagline: "",
  description: "",
};

/** Never throws: invalid or hostile input renders as "Untitled entry". */
export function parseEntryMetadata(input: unknown): EntryMetadata {
  try {
    const r = EntryMetadata.safeParse(input);
    if (r.success) return r.data;
  } catch {
    // fall through to the fallback
  }
  return { ...UNTITLED_ENTRY };
}

export function parseContestMetadata(input: unknown): ContestMetadata {
  try {
    const r = ContestMetadata.safeParse(input);
    if (r.success) return r.data;
  } catch {
    // fall through to the fallback
  }
  return { version: 1, description: "" };
}
