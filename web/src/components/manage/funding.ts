import { isAddress, parseEther, getAddress, zeroAddress, type Address } from "viem";

/** Parses an amount typed by a person ("0.05", "0,05"). `null` for anything that isn't a positive number. */
export function parseAmount(text: string): bigint | null {
  const t = text.trim().replace(",", ".");
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return null;
  try {
    const wei = parseEther(t.endsWith(".") ? t.slice(0, -1) : t);
    return wei > 0n ? wei : null;
  } catch {
    return null;
  }
}

export type FundCheck =
  | { ok: true; to: Address; value: bigint }
  | { ok: false; reason: string };

/** Everything the "Send" button needs to be enabled, with the reason when it isn't. */
export function checkFunding(addressText: string, amountText: string): FundCheck {
  const a = addressText.trim();
  if (a === "") return { ok: false, reason: "Paste the address to fund." };
  if (!isAddress(a, { strict: false })) return { ok: false, reason: "That doesn't look like a wallet address." };
  const to = getAddress(a);
  if (to === zeroAddress) return { ok: false, reason: "The zero address can't be funded." };
  const value = parseAmount(amountText);
  if (value === null) return { ok: false, reason: "Enter an amount greater than zero." };
  return { ok: true, to, value };
}

/** Rough number of check-ins a gate balance covers; `null` when the drip is 0 (nothing to count). */
export function checkInsLeft(balance: bigint, dripPerCheckIn: bigint): number | null {
  if (dripPerCheckIn === 0n) return null;
  return Number(balance / dripPerCheckIn);
}
