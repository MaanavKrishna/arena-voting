import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PresenceStatus } from "@/hooks/usePresence";
import { BeaconQRScanner, isBeaconQR } from "./BeaconQRScanner";
import { PresenceChip, ageLabel, type PresenceChipProps } from "./PresenceChip";

const noop = () => {};

function chip(props: Partial<PresenceChipProps> & { status: PresenceStatus }) {
  const onListen = vi.fn();
  const onScan = vi.fn();
  const utils = render(<PresenceChip onListen={onListen} onScan={onScan} explained {...props} />);
  return { ...utils, onListen, onScan, root: utils.container.querySelector("[data-presence-chip]")! };
}

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("IntersectionObserver", NoopObserver);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PresenceChip", () => {
  it("idle: asks to prove presence and listens on tap", () => {
    const { onListen, root } = chip({ status: "idle" });
    expect(root.getAttribute("data-state")).toBe("idle");
    expect(screen.getByText("Prove you're in the room")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Listen" }));
    expect(onListen).toHaveBeenCalledOnce();
  });

  it("idle, first time: explains the mic before the browser asks", async () => {
    const onListen = vi.fn();
    render(<PresenceChip status="idle" onListen={onListen} onScan={noop} />);
    fireEvent.click(screen.getByRole("button", { name: "Listen" }));
    expect(await screen.findByText("We only listen for the room signal. Nothing is recorded or sent.")).toBeTruthy();
    expect(onListen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Turn on microphone" }));
    expect(onListen).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem("arena.mic-explained")).toBe("1");
  });

  it("idle, explainer dismissed with Not now", async () => {
    const onListen = vi.fn();
    render(<PresenceChip status="idle" onListen={onListen} onScan={noop} />);
    fireEvent.click(screen.getByRole("button", { name: "Listen" }));
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Listen" })).toBeTruthy());
    expect(onListen).not.toHaveBeenCalled();
  });

  it("requesting-mic: tells you to allow", () => {
    chip({ status: "requesting-mic" });
    expect(screen.getByText("Allow the microphone")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("listening: no action yet; shows why the last token was refused", () => {
    const { rerender } = chip({ status: "listening" });
    expect(screen.getByText("Listening for the room…")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<PresenceChip status="listening" rejected="expired" onListen={noop} onScan={noop} explained />);
    expect(screen.getByText("That signal is too old. Listening for a fresh one…")).toBeTruthy();
  });

  it("validating: checking the signal", () => {
    chip({ status: "validating" });
    expect(screen.getByText("Checking the signal…")).toBeTruthy();
  });

  it("offer-qr: still listening, offers the camera", () => {
    const { onScan } = chip({ status: "offer-qr" });
    expect(screen.getByText("Listening for the room…")).toBeTruthy();
    expect(screen.getByText("Can't hear it? Scan the code on the big screen.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Scan the screen" }));
    expect(onScan).toHaveBeenCalledOnce();
  });

  it("in-room: verified, with the token's age", () => {
    const { root } = chip({ status: "in-room", ageMs: 12_400, inRoom: true });
    const title = screen.getByText("In the room");
    expect(title.className).toContain("text-verified-text");
    expect(screen.getByText("Signal heard 12 s ago")).toBeTruthy();
    expect(root.getAttribute("data-state")).toBe("in-room");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("stale while listening: lost the signal, listening again, camera offered", () => {
    const { onScan } = chip({ status: "stale", micOn: true });
    expect(screen.getByText("Lost the room signal")).toBeTruthy();
    expect(screen.getByText("Listening again…")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Scan the screen" }));
    expect(onScan).toHaveBeenCalledOnce();
  });

  it("stale without the mic: scan again", () => {
    chip({ status: "stale", micOn: false });
    expect(screen.getByRole("button", { name: "Scan again" })).toBeTruthy();
  });

  it("mic-denied: offers the QR scan instead", () => {
    const { onScan } = chip({ status: "mic-denied", micProblem: "denied" });
    expect(screen.getByText("Microphone is off")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Scan the screen instead" }));
    expect(onScan).toHaveBeenCalledOnce();
  });

  it("mic-denied because the browser can't: says so", () => {
    chip({ status: "mic-denied", micProblem: "unsupported" });
    expect(screen.getByText("This phone can't listen here")).toBeTruthy();
  });

  it("paused: tap to listen again (and says if you're still in)", () => {
    const { onListen } = chip({ status: "paused", inRoom: true });
    expect(screen.getByText("Listening paused")).toBeTruthy();
    expect(screen.getByText("You're still in the room for now.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tap to listen again" }));
    expect(onListen).toHaveBeenCalledOnce();
  });

  it("formats the age", () => {
    expect(ageLabel(null)).toBe("");
    expect(ageLabel(2000)).toBe("Signal heard just now");
    expect(ageLabel(45_900)).toBe("Signal heard 45 s ago");
  });
});

describe("BeaconQRScanner", () => {
  it("only room codes count", () => {
    expect(isBeaconQR("arena:b1:AQAAAAI")).toBe(true);
    expect(isBeaconQR("arena:p1:xyz")).toBe(false);
    expect(isBeaconQR("https://example.com")).toBe(false);
  });

  it("explains before opening the camera", () => {
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
    render(<BeaconQRScanner onBeacon={() => true} />);
    expect(screen.getByText(/small code under the results/)).toBeTruthy();
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});

describe("PresenceChip refusals", () => {
  beforeEach(() => vi.stubGlobal("IntersectionObserver", NoopObserver));
  it("idle after an expired token: says it was too old", () => {
    render(<PresenceChip status="idle" rejected="expired" onListen={noop} onScan={noop} explained />);
    expect(screen.getByText("That signal is too old. Try a fresh one.")).toBeTruthy();
  });
});
