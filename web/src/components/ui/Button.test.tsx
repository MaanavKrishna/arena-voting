import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

afterEach(cleanup);

describe("Button", () => {
  it("shows pressed feedback on pointer-down and clears it on release", () => {
    render(<Button>Vote</Button>);
    const btn = screen.getByRole("button", { name: "Vote" });
    expect(btn.hasAttribute("data-pressed")).toBe(false);
    fireEvent.pointerDown(btn);
    expect(btn.getAttribute("data-pressed")).toBe("true");
    fireEvent.pointerUp(btn);
    expect(btn.hasAttribute("data-pressed")).toBe(false);
  });

  it("exposes a toggle state through aria-pressed", () => {
    render(<Button pressed>Follow</Button>);
    expect(screen.getByRole("button", { name: "Follow" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("while loading: keeps the label for width, marks busy and ignores clicks", () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Create contest
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Create contest" });
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(btn.querySelector(".invisible")?.textContent).toBe("Create contest");
    fireEvent.pointerDown(btn);
    expect(btn.hasAttribute("data-pressed")).toBe(false);
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("when disabled: is natively disabled and ignores clicks", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Claim
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Claim" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("fires onClick when enabled", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
