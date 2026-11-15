import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WriteStatus } from "@/hooks/useArenaWrite";
import type { GuardState, NetworkGuardApi } from "./NetworkGuard";
import { TxButton, txView, type TxButtonProps } from "./TxButton";

const guard: NetworkGuardApi = {
  state: "ready",
  switchNetwork: vi.fn(),
  isSwitching: false,
  switchError: null,
};
const openConnect = vi.fn();

vi.mock("./NetworkGuard", () => ({ useNetworkGuard: () => guard }));
vi.mock("./ConnectSheet", () => ({ useConnectLauncher: () => ({ openConnect, sheet: null }) }));
vi.mock("@/config/network", () => ({
  chainName: "Testchain",
  explorerTxUrl: (hash: string) => `https://explorer.example/tx/${hash}`,
}));

const HASH = `0x${"ab".repeat(32)}` as const;

function setup(
  status: WriteStatus,
  opts: { guard?: GuardState; isSwitching?: boolean; props?: Partial<TxButtonProps>; error?: TxButtonProps["action"]["error"]; txHash?: `0x${string}` } = {},
) {
  guard.state = opts.guard ?? "ready";
  guard.isSwitching = opts.isSwitching ?? false;
  const onClick = vi.fn();
  const busy = status === "simulating" || status === "confirm-in-wallet" || status === "pending";
  const utils = render(
    <TxButton
      action={{ status, isBusy: busy, error: opts.error ?? null, txHash: opts.txHash }}
      onClick={onClick}
      {...opts.props}
    >
      Vote
    </TxButton>,
  );
  const root = utils.container.querySelector("[data-tx-state]") as HTMLElement;
  const button = utils.container.querySelector("button") as HTMLButtonElement;
  return { onClick, root, button, ...utils };
}

/** The label a sighted user sees (hidden copies are aria-hidden + invisible). */
function visibleLabel(button: HTMLElement): string {
  const shown = Array.from(button.querySelectorAll("span.col-start-1")).filter(
    (el) => !el.classList.contains("invisible"),
  );
  return shown.map((el) => el.textContent).join("");
}

beforeEach(() => {
  vi.mocked(guard.switchNetwork).mockClear();
  openConnect.mockClear();
});
afterEach(cleanup);

describe("txView", () => {
  const base = { guard: "ready" as GuardState, status: "idle" as WriteStatus, isSwitching: false };
  it("orders: in-flight > disabled reason > wallet gate > error > ready", () => {
    expect(txView({ ...base, status: "pending", disabledReason: "Closed" })).toBe("pending");
    expect(txView({ ...base, guard: "connect", disabledReason: "Closed" })).toBe("disabled");
    expect(txView({ ...base, guard: "connect", status: "error" })).toBe("connect");
    expect(txView({ ...base, guard: "wrong-network", status: "error" })).toBe("wrong-network");
    expect(txView({ ...base, guard: "wrong-network", isSwitching: true })).toBe("switching");
    expect(txView({ ...base, status: "error" })).toBe("error");
    expect(txView({ ...base, status: "simulating" })).toBe("preparing");
    expect(txView({ ...base, status: "confirmed", guard: "connect" })).toBe("confirmed");
    expect(txView({ ...base, guard: "checking" })).toBe("checking");
    expect(txView(base)).toBe("ready");
  });
});

describe("TxButton", () => {
  it("connect: says so and opens the Connect sheet instead of writing", () => {
    const { root, button, onClick } = setup("idle", { guard: "connect", props: { hidePasskeyWallets: true } });
    expect(root.dataset.txState).toBe("connect");
    expect(visibleLabel(button)).toBe("Connect wallet");
    fireEvent.click(button);
    expect(openConnect).toHaveBeenCalledWith({ hidePasskey: true });
    expect(onClick).not.toHaveBeenCalled();
  });

  it("wrong network: offers the switch to the app's network", () => {
    const { root, button, onClick } = setup("idle", { guard: "wrong-network" });
    expect(root.dataset.txState).toBe("wrong-network");
    expect(visibleLabel(button)).toBe("Switch to Testchain");
    fireEvent.click(button);
    expect(guard.switchNetwork).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("switching: busy while the wallet decides, ignores clicks", () => {
    const { root, button } = setup("idle", { guard: "wrong-network", isSwitching: true });
    expect(root.dataset.txState).toBe("switching");
    expect(button.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(button);
    expect(guard.switchNetwork).not.toHaveBeenCalled();
  });

  it("ready: shows the action label and runs onClick", () => {
    const { root, button, onClick } = setup("idle");
    expect(root.dataset.txState).toBe("ready");
    expect(visibleLabel(button)).toBe("Vote");
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("disabled: natively disabled with the reason beneath, linked by aria-describedby", () => {
    const { root, button, onClick } = setup("idle", { props: { disabledReason: "Voting opens at 7 pm." } });
    expect(root.dataset.txState).toBe("disabled");
    expect(button.disabled).toBe(true);
    const reason = screen.getByText("Voting opens at 7 pm.");
    expect(button.getAttribute("aria-describedby")).toBe(reason.parentElement?.id);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("preparing (simulating): busy, ignores clicks", () => {
    const { root, button, onClick } = setup("simulating");
    expect(root.dataset.txState).toBe("preparing");
    expect(button.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("confirm in wallet: tells the person where to look and announces it", () => {
    const { root, button, onClick } = setup("confirm-in-wallet");
    expect(root.dataset.txState).toBe("confirm-in-wallet");
    expect(visibleLabel(button)).toBe("Confirm in your wallet");
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.disabled).toBe(false); // stays focusable; clicks are ignored
    expect(screen.getByRole("status").textContent).toBe("Confirm in your wallet.");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("pending: spinner label plus a Details disclosure with the explorer link", () => {
    const { root, button } = setup("pending", { txHash: HASH });
    expect(root.dataset.txState).toBe("pending");
    expect(visibleLabel(button)).toBe("Finishing up…");
    expect(screen.getByText("Details")).toBeTruthy();
    const link = screen.getByRole("link", { name: /view on block explorer/i, hidden: true });
    expect(link.getAttribute("href")).toBe(`https://explorer.example/tx/${HASH}`);
    expect(screen.getByRole("status").textContent).toBe("Waiting for the network to confirm.");
  });

  it("confirmed: shows the confirmed label (default Done) and ignores clicks", () => {
    const { root, button, onClick, unmount } = setup("confirmed", { txHash: HASH });
    expect(root.dataset.txState).toBe("confirmed");
    expect(visibleLabel(button)).toBe("Done");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    unmount();
    const custom = setup("confirmed", { props: { confirmedLabel: "Voted" } });
    expect(visibleLabel(custom.button)).toBe("Voted");
  });

  it("error: plain title + detail beneath and Try again re-runs the action", () => {
    const { root, button, onClick } = setup("error", {
      error: { title: "You cancelled in your wallet.", detail: "Nothing was changed." },
    });
    expect(root.dataset.txState).toBe("error");
    expect(visibleLabel(button)).toBe("Try again");
    expect(screen.getByText("Nothing was changed.")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("You cancelled in your wallet.");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("keeps every label in the button so its width never jumps", () => {
    const { button } = setup("idle");
    const labels = Array.from(button.querySelectorAll("span.col-start-1")).map((el) => el.textContent);
    expect(labels).toEqual([
      "Vote",
      "Connect wallet",
      "Switch to Testchain",
      "Checking…",
      "Confirm in your wallet",
      "Finishing up…",
      "Done",
      "Try again",
    ]);
  });
});
