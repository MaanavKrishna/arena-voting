import { bytesToHex, hexToBytes, isHex, size, type Hex } from "viem";

// Payload v1 (25 bytes): version(1) | contestId u32 BE | slot u32 BE | token(16).
// See docs/ground-presence.md "Payload format".
export const PAYLOAD_VERSION = 1;
export const PAYLOAD_LENGTH = 25;
export const QR_PREFIX = "arena:b1:";

export type BeaconPayload = { contestId: number; slot: number; token: Hex };

const U32_MAX = 0xffffffff;

function assertU32(name: string, v: number): void {
  if (!Number.isInteger(v) || v < 0 || v > U32_MAX) {
    throw new RangeError(`${name} must be a uint32`);
  }
}

export function encodePayload(p: BeaconPayload): Uint8Array {
  assertU32("contestId", p.contestId);
  assertU32("slot", p.slot);
  if (!isHex(p.token) || size(p.token) !== 16) throw new RangeError("token must be 16 bytes");
  const out = new Uint8Array(PAYLOAD_LENGTH);
  const view = new DataView(out.buffer);
  out[0] = PAYLOAD_VERSION;
  view.setUint32(1, p.contestId, false);
  view.setUint32(5, p.slot, false);
  out.set(hexToBytes(p.token), 9);
  return out;
}

export function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Strict base64url (no padding, url-safe alphabet). Returns null if malformed. */
export function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  try {
    const bin = atob(padded);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export function toQrText(p: BeaconPayload): string {
  return QR_PREFIX + toBase64Url(encodePayload(p));
}

function decodeBytes(bytes: Uint8Array): BeaconPayload | null {
  if (bytes.length !== PAYLOAD_LENGTH || bytes[0] !== PAYLOAD_VERSION) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    contestId: view.getUint32(1, false),
    slot: view.getUint32(5, false),
    token: bytesToHex(bytes.slice(9, 25)),
  };
}

/** Accepts raw bytes, a base64url string, an `arena:b1:` QR text, or 0x-hex. Never throws. */
export function decodePayload(input: Uint8Array | string): BeaconPayload | null {
  if (typeof input !== "string") return decodeBytes(input);
  let text = input.trim();
  if (text.startsWith(QR_PREFIX)) text = text.slice(QR_PREFIX.length);
  else if (text.startsWith("arena:")) return null;
  if (isHex(text)) {
    try {
      return decodeBytes(hexToBytes(text));
    } catch {
      return null;
    }
  }
  const bytes = fromBase64Url(text);
  return bytes === null ? null : decodeBytes(bytes);
}
