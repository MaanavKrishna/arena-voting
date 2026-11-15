/** Pure helpers behind `/me`: turn raw Arena logs into the rows each section shows. */

type Ordered = { blockNumber?: bigint | null; logIndex?: number | null };

/** Newest first (by block, then log index). Logs without a position keep their relative order at the end. */
export function newestFirst<T extends Ordered>(logs: readonly T[]): T[] {
  return [...logs].sort((a, b) => {
    const ab = a.blockNumber ?? -1n;
    const bb = b.blockNumber ?? -1n;
    if (ab !== bb) return ab < bb ? 1 : -1;
    return (b.logIndex ?? -1) - (a.logIndex ?? -1);
  });
}

const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

export type EntrySubmittedArgs = {
  contestId?: bigint;
  entryId?: number;
  payee?: string;
  submitter?: string;
  metadataURI?: string;
};

/** How `account` relates to an entry: submitted it, is paid for it, or both. `null` if neither. */
export function entryRole(args: EntrySubmittedArgs, account: string): "submitter" | "payee" | "both" | null {
  const sub = same(args.submitter, account);
  const pay = same(args.payee, account);
  if (sub && pay) return "both";
  if (sub) return "submitter";
  if (pay) return "payee";
  return null;
}

export const entryKey = (contestId: bigint, entryId: number) => `${contestId}:${entryId}`;

/** `contestId:entryId` -> metadata URI, from every EntrySubmitted log. */
export function entryUriIndex(logs: readonly { args: EntrySubmittedArgs }[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const { args } of logs) {
    if (args.contestId !== undefined && args.entryId !== undefined && args.metadataURI !== undefined) {
      out.set(entryKey(args.contestId, args.entryId), args.metadataURI);
    }
  }
  return out;
}

/** One row per contest, newest activity first, however many logs mention it. */
export function uniqueContestIds(logs: readonly { args: { contestId?: bigint } }[]): bigint[] {
  const seen = new Set<string>();
  const out: bigint[] = [];
  for (const { args } of logs) {
    if (args.contestId === undefined) continue;
    const k = args.contestId.toString();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(args.contestId);
  }
  return out;
}
