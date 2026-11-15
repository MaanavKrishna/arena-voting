import { formatEther } from "viem";

export function shortAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Wei -> ETH string, trailing zeros trimmed, truncated (never rounded up) to `maxDecimals` (default 4). */
export function formatEth(wei: bigint, opts: { maxDecimals?: number } = {}): string {
  const max = opts.maxDecimals ?? 4;
  const [whole, frac = ""] = formatEther(wei).split(".");
  const cut = frac.slice(0, max).replace(/0+$/, "");
  if (wei > BigInt(0) && whole === "0" && cut === "") {
    return `<0.${"0".repeat(Math.max(max - 1, 0))}1`;
  }
  return cut === "" ? whole : `${whole}.${cut}`;
}

/** Unix-second timestamps. "in 2 min", "10 min ago", "now" within 5 s. */
export function relativeTime(target: bigint, now: bigint): string {
  const diff = Number(target - now);
  const abs = Math.abs(diff);
  if (abs < 5) return "now";
  let text: string;
  if (abs < 60) text = `${abs} s`;
  else if (abs < 3600) text = `${Math.floor(abs / 60)} min`;
  else if (abs < 86400) text = `${Math.floor(abs / 3600)} h`;
  else text = `${Math.floor(abs / 86400)} d`;
  return diff > 0 ? `in ${text}` : `${text} ago`;
}

const encoder = new TextEncoder();

export function byteLength(text: string): number {
  return encoder.encode(text).length;
}
