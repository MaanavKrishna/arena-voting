"use client";

import { useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { Sheet } from "@/components/ui/Sheet";
import { extractAddress } from "./gatekeepers";

/** Reads a wallet address from a QR code (the Gate page shows its address as one). */
export function AddressScanner({
  open,
  onOpenChange,
  onAddress,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddress: (address: Address) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const handler = useRef(onAddress);
  useEffect(() => {
    handler.current = onAddress;
  });

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let stop: (() => void) | undefined;
    (async () => {
      try {
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        const video = videoRef.current;
        if (!video || stopped) return;
        const controls = await new BrowserQRCodeReader().decodeFromConstraints(
          { video: { facingMode: "environment" } },
          video,
          (result) => {
            const found = result ? extractAddress(result.getText()) : null;
            if (found && !stopped) {
              stopped = true;
              controls?.stop();
              handler.current(found);
              onOpenChange(false);
            }
          },
        );
        if (stopped) controls.stop();
        else stop = () => controls.stop();
      } catch {
        if (!stopped) setProblem("We couldn't open the camera. Allow camera access, or paste the address instead.");
      }
    })();
    return () => {
      stopped = true;
      stop?.();
    };
  }, [open, onOpenChange]);

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) setProblem(null);
        onOpenChange(o);
      }}
      title="Scan the gate's code"
      description="Point the camera at the QR code on the Gate page."
    >
      <div className="bg-fg/6 aspect-square w-full overflow-hidden rounded-md">
        <video ref={videoRef} className="size-full object-cover" muted playsInline />
      </div>
      {problem ? (
        <p role="alert" className="text-footnote text-danger-text mt-3">
          {problem}
        </p>
      ) : null}
    </Sheet>
  );
}
