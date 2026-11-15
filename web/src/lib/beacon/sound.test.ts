// @vitest-environment node
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { GgwaveModule } from "ggwave";
import { encodePayload, decodePayload } from "./payload";
import { bytesKey } from "./sound";
import { decodeChunk, encodeSamples, makeInstance, selectRxProtocols } from "./sound.worker";

const require = createRequire(import.meta.url);

async function loadGgwave(): Promise<GgwaveModule> {
  const factory = require("ggwave") as (o?: { print?: () => void; printErr?: () => void }) => Promise<GgwaveModule>;
  const g = await factory({ print: () => {}, printErr: () => {} });
  g.disableLog();
  return g;
}

/** Feed a waveform to the decoder in 1024-sample chunks (what the AudioWorklet posts), with silence around it. */
function roundTrip(g: GgwaveModule, samples: Float32Array, sampleRate: number): Uint8Array | null {
  const rx = makeInstance(g, sampleRate, false);
  const padded = new Float32Array(samples.length + sampleRate); // 0.5 s silence each side
  padded.set(samples, sampleRate / 2);
  let found: Uint8Array | null = null;
  for (let i = 0; i + 1024 <= padded.length && !found; i += 1024) {
    found = decodeChunk(g, rx, padded.slice(i, i + 1024));
  }
  g.free(rx);
  return found;
}

describe("ggwave via the worker helpers", () => {
  const payload = encodePayload({ contestId: 2, slot: 4242, token: "0x00112233445566778899aabbccddeeff" });

  it.each(["ULTRASOUND_FASTEST", "AUDIBLE_FASTEST"] as const)("round-trips the 25-byte payload with %s at 48 kHz", async (protocol) => {
    const g = await loadGgwave();
    selectRxProtocols(g, ["ULTRASOUND_FASTEST", "AUDIBLE_FASTEST"]);
    const tx = makeInstance(g, 48_000, true);
    const samples = encodeSamples(g, tx, payload, protocol);
    expect(samples.length / 48_000).toBeCloseTo(0.77, 1); // D-06: 0.77 s per 25-byte payload
    const decoded = roundTrip(g, samples, 48_000);
    expect(decoded && bytesKey(decoded)).toBe(bytesKey(payload));
    expect(decodePayload(decoded!)).toEqual({ contestId: 2, slot: 4242, token: "0x00112233445566778899aabbccddeeff" });
    g.free(tx);
  });

  it("the encoded samples are a copy, not a view over ggwave's static buffer", async () => {
    const g = await loadGgwave();
    const tx = makeInstance(g, 48_000, true);
    const a = encodeSamples(g, tx, payload, "ULTRASOUND_FASTEST");
    const before = a.slice();
    encodeSamples(g, tx, encodePayload({ contestId: 9, slot: 1, token: "0xffffffffffffffffffffffffffffffff" }), "AUDIBLE_FASTEST");
    expect(a).toEqual(before);
  });
});
