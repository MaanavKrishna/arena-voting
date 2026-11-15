"use client";

import { Mic } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

const SEEN_KEY = "arena.mic-explained";

/** Whether the explainer has been shown and accepted on this device. */
export function micExplained(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberMicExplained(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // private mode: show it again next time, that's fine
  }
}

/** True if the browser already has mic permission (no prompt will appear), best effort. */
export async function micAlreadyGranted(): Promise<boolean> {
  try {
    const status = await navigator.permissions?.query({
      name: "microphone" as PermissionName,
    });
    return status?.state === "granted";
  } catch {
    return false;
  }
}

export type MicExplainerProps = {
  /** Called from the tap: start listening here (the mic prompt needs the gesture). */
  onAllow: () => void;
  onCancel: () => void;
  className?: string;
};

/** One line of reassurance before the browser's microphone prompt (design-system §11). */
export function MicExplainer({ onAllow, onCancel, className }: MicExplainerProps) {
  return (
    <div className={cn("flex flex-col gap-3", className)} data-mic-explainer="">
      <div className="flex items-start gap-3">
        <span className="bg-accent/12 text-accent grid size-9 shrink-0 place-items-center rounded-full">
          <Mic className="size-4.5" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-callout text-fg font-medium">Your phone will use the microphone</p>
          <p className="text-footnote text-fg-muted text-pretty">
            We only listen for the room signal. Nothing is recorded or sent.
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          className="flex-1"
          onClick={() => {
            rememberMicExplained();
            onAllow();
          }}
        >
          Turn on microphone
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Not now
        </Button>
      </div>
    </div>
  );
}
