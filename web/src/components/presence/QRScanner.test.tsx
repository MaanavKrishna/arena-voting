import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QRScanner, classifyCameraError } from "./QRScanner";

function fakeStream() {
  const track = { stop: vi.fn(), getSettings: () => ({ facingMode: "environment" }) };
  return {
    track,
    stream: { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream,
  };
}

const getUserMedia = vi.fn();
const enumerateDevices = vi.fn(async () => [] as MediaDeviceInfo[]);

beforeEach(() => {
  getUserMedia.mockReset();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia, enumerateDevices },
  });
  Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: () => Promise.resolve() });
  Object.defineProperty(HTMLMediaElement.prototype, "readyState", { configurable: true, get: () => 4 });
  Object.defineProperty(HTMLMediaElement.prototype, "srcObject", { configurable: true, writable: true, value: null });
});

afterEach(() => {
  cleanup();
  delete (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector;
});

describe("QRScanner", () => {
  it("explains first and never opens the camera without a tap", () => {
    render(<QRScanner onScan={() => {}} explainer="We read passes with the camera." />);
    expect(screen.getByText("We read passes with the camera.")).toBeTruthy();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("asks for the rear camera, reads codes with BarcodeDetector, drops quick repeats", async () => {
    const { stream } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    const detect = vi.fn(async () => [{ rawValue: "arena:p1:abc" }]);
    (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector = class {
      static getSupportedFormats = async () => ["qr_code"];
      detect = detect;
    };
    const onScan = vi.fn();
    const onStatus = vi.fn();
    const { container } = render(<QRScanner onScan={onScan} onStatusChange={onStatus} />);
    fireEvent.click(screen.getByRole("button", { name: /turn on camera/i }));

    await waitFor(() => expect(onScan).toHaveBeenCalledWith("arena:p1:abc"));
    const constraints = getUserMedia.mock.calls[0][0] as MediaStreamConstraints;
    expect(constraints.audio).toBe(false);
    expect((constraints.video as MediaTrackConstraints).facingMode).toEqual({ ideal: "environment" });
    expect(container.querySelector("[data-scanner-status]")?.getAttribute("data-scanner-status")).toBe("live");
    expect(onStatus).toHaveBeenCalledWith("live");
    // the detector keeps reading the same frame, but the same text isn't reported twice in a row quickly
    await waitFor(() => expect(detect.mock.calls.length).toBeGreaterThan(1));
    expect(onScan).toHaveBeenCalledTimes(1);
  });

  it("doesn't report while paused", async () => {
    const { stream } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    const detect = vi.fn(async () => [{ rawValue: "x" }]);
    (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector = class {
      static getSupportedFormats = async () => ["qr_code"];
      detect = detect;
    };
    const onScan = vi.fn();
    render(<QRScanner onScan={onScan} paused autoStart />);
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    await act(() => new Promise((r) => setTimeout(r, 300)));
    expect(onScan).not.toHaveBeenCalled();
  });

  it("stops the camera on unmount", async () => {
    const { stream, track } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector = class {
      static getSupportedFormats = async () => ["qr_code"];
      detect = async () => [];
    };
    const { unmount, container } = render(<QRScanner onScan={() => {}} autoStart />);
    await waitFor(() =>
      expect(container.querySelector("[data-scanner-status]")?.getAttribute("data-scanner-status")).toBe("live"),
    );
    unmount();
    expect(track.stop).toHaveBeenCalled();
  });

  it("says plainly when the camera is blocked", async () => {
    getUserMedia.mockRejectedValue(Object.assign(new Error("no"), { name: "NotAllowedError" }));
    render(<QRScanner onScan={() => {}} autoStart />);
    expect(await screen.findByText("Camera is blocked")).toBeTruthy();
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
  });

  it("classifies camera errors", () => {
    expect(classifyCameraError({ name: "NotAllowedError" })).toBe("denied");
    expect(classifyCameraError({ name: "NotFoundError" })).toBe("unavailable");
    expect(classifyCameraError({ name: "NotReadableError" })).toBe("unavailable");
    expect(classifyCameraError(new Error("?"))).toBe("error");
  });
});
