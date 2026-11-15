import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Sheet } from "./Sheet";

afterEach(cleanup);

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open sheet
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="Connect a wallet" description="Pick one">
        <button type="button">First action</button>
        <button type="button">Second action</button>
      </Sheet>
    </>
  );
}

async function openSheet() {
  const trigger = screen.getByRole("button", { name: "Open sheet" });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = await screen.findByRole("dialog", { name: "Connect a wallet" });
  await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  return { trigger, dialog };
}

describe("Sheet", () => {
  it("opens as a labelled modal dialog and moves focus inside", async () => {
    render(<Harness />);
    const { dialog } = await openSheet();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement?.textContent).toBe("First action");
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    render(<Harness />);
    const { trigger } = await openSheet();
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(document.activeElement).toBe(trigger);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("traps Tab focus inside the sheet", async () => {
    render(<Harness />);
    const { dialog } = await openSheet();
    const close = screen.getByRole("button", { name: "Close" });
    close.focus();
    // Close is the first focusable in DOM order; Shift+Tab wraps to the last action.
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement?.textContent).toBe("Second action");
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});
