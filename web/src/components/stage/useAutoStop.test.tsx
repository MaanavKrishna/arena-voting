import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAutoStop } from "./useAutoStop";

describe("useAutoStop", () => {
  it("stops a running beacon as soon as voting closes", () => {
    const stop = vi.fn();
    const { rerender } = renderHook(({ closed, status }) => useAutoStop(closed, status, stop), {
      initialProps: { closed: false, status: "on" as const },
    });
    expect(stop).not.toHaveBeenCalled();
    rerender({ closed: true, status: "on" });
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("also stops a beacon that is still starting when voting closes", () => {
    const stop = vi.fn();
    renderHook(() => useAutoStop(true, "starting", stop));
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("does nothing while voting is open or when the beacon is already off", () => {
    const stop = vi.fn();
    renderHook(() => useAutoStop(false, "on", stop));
    renderHook(() => useAutoStop(true, "off", stop));
    expect(stop).not.toHaveBeenCalled();
  });
});
