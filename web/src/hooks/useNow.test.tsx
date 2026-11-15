import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { createClock, useNow } from "./useNow";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
});
afterEach(() => vi.useRealTimers());

describe("createClock", () => {
  it("runs one interval for any number of subscribers and stops with the last", () => {
    const set = vi.fn((fn: () => void, ms: number) => setInterval(fn, ms));
    const clear = vi.fn((id: unknown) => clearInterval(id as ReturnType<typeof setInterval>));
    const clock = createClock(() => Date.now(), { set, clear });
    const a = clock.subscribe(() => {});
    const b = clock.subscribe(() => {});
    const c = clock.subscribe(() => {});
    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0][1]).toBe(1_000);
    expect(clock.intervalCount()).toBe(1);
    a();
    b();
    expect(clear).not.toHaveBeenCalled();
    c();
    expect(clear).toHaveBeenCalledTimes(1);
    expect(clock.intervalCount()).toBe(0);
  });

  it("notifies listeners as seconds change", () => {
    const clock = createClock();
    const listener = vi.fn();
    const off = clock.subscribe(listener);
    const start = clock.getSnapshot();
    vi.advanceTimersByTime(3_000);
    expect(listener).toHaveBeenCalledTimes(3);
    expect(clock.getSnapshot()).toBe(start + 3n);
    off();
  });
});

describe("useNow", () => {
  it("returns unix seconds as a bigint and advances each second", () => {
    const { result } = renderHook(() => useNow());
    expect(result.current).toBe(1_767_225_600n);
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(result.current).toBe(1_767_225_602n);
  });

  it("shares one interval across hook instances", () => {
    const spy = vi.spyOn(globalThis, "setInterval");
    const before = spy.mock.calls.length;
    const a = renderHook(() => useNow());
    const b = renderHook(() => useNow());
    expect(spy.mock.calls.length - before).toBeLessThanOrEqual(1);
    a.unmount();
    b.unmount();
    spy.mockRestore();
  });
});
