import { describe, expect, it } from "vitest";
import {
  MAX_SAMPLES,
  SKEW_WARNING_SECONDS,
  chainTimeReducer,
  initialChainTime,
  type ChainTimeState,
} from "./useChainTime";

type Obs = { block: bigint; ts: number; localMs: number };

function run(observations: Obs[], from: ChainTimeState = initialChainTime): ChainTimeState {
  return observations.reduce(
    (s, o) => chainTimeReducer(s, { type: "block", blockNumber: o.block, blockTimestamp: BigInt(o.ts), localNowMs: o.localMs }),
    from,
  );
}

/**
 * Chain with a block every 12 s (timestamps are whole seconds), polled every 2 s by a device whose
 * clock is `clockSkew` seconds ahead of true time. Each poll reports the latest block.
 */
function simulate(clockSkew: number, seconds: number, blockEvery = 12): Obs[] {
  const t0 = 1_700_000_000;
  const out: Obs[] = [];
  for (let t = 0; t <= seconds; t += 2) {
    const block = Math.floor(t / blockEvery);
    out.push({ block: BigInt(block + 100), ts: t0 + block * blockEvery, localMs: (t0 + t + clockSkew) * 1000 });
  }
  return out;
}

describe("chainTimeReducer", () => {
  it("warns when the device clock is 40 s off", () => {
    const behind = run(simulate(-40, 200));
    expect(behind.offset).toBeGreaterThan(SKEW_WARNING_SECONDS);
    expect(behind.skewWarning).toBe(true);
    const ahead = run(simulate(40, 200));
    expect(ahead.offset).toBeLessThan(-SKEW_WARNING_SECONDS);
    expect(ahead.skewWarning).toBe(true);
  });

  it("does not warn with a correct clock, despite 0-12 s of block lag", () => {
    const s = run(simulate(0, 200));
    expect(s.skewWarning).toBe(false);
    expect(Math.abs(s.offset)).toBeLessThanOrEqual(2);
  });

  it("stays within 2 s of the truth for a clock 5 s fast", () => {
    const s = run(simulate(5, 200));
    expect(Math.abs(s.offset - -5)).toBeLessThanOrEqual(2);
    expect(s.skewWarning).toBe(false);
  });

  it("only samples when a new block number appears", () => {
    const s = run([
      { block: 5n, ts: 1000, localMs: 1_000_000 },
      { block: 5n, ts: 1000, localMs: 1_002_000 },
      { block: 5n, ts: 1000, localMs: 1_004_000 },
    ]);
    expect(s.samples).toHaveLength(1);
  });

  it("takes the maximum of the fresh samples, not the first or the average", () => {
    const s = run([
      { block: 1n, ts: 1000, localMs: 1_008_000 }, // seen 8 s late -> -8
      { block: 2n, ts: 1012, localMs: 1_013_000 }, // 1 s late -> -1
      { block: 3n, ts: 1024, localMs: 1_030_000 }, // 6 s late -> -6
    ]);
    expect(s.offset).toBe(-1);
  });

  it("forgets samples beyond the last 30", () => {
    // first sample is a huge outlier; after 30 more it must be gone
    const outlier: Obs = { block: 1n, ts: 5000, localMs: 0 };
    const rest: Obs[] = Array.from({ length: MAX_SAMPLES }, (_, i) => ({
      block: BigInt(i + 2),
      ts: 1000 + i * 12,
      localMs: (1000 + i * 12 + 1) * 1000,
    }));
    const s = run([outlier, ...rest]);
    expect(s.samples).toHaveLength(MAX_SAMPLES);
    expect(s.offset).toBe(-1);
    expect(s.skewWarning).toBe(false);
  });

  it("has no warning and zero offset before any block is seen", () => {
    expect(initialChainTime.offset).toBe(0);
    expect(initialChainTime.skewWarning).toBe(false);
    expect(initialChainTime.ready).toBe(false);
  });

  it("resets history on a chain switch", () => {
    const s = run(simulate(-40, 50));
    const r = chainTimeReducer(s, { type: "reset" });
    expect(r).toEqual(initialChainTime);
  });
});
