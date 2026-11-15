"use client";

import { useState } from "react";
import { QR_PREFIX } from "@/lib/beacon/payload";
import { QRScanner } from "./QRScanner";

export type BeaconQRScannerProps = {
  /**
   * A room code was read. Return true if it belongs to this contest (the scanner then stops
   * reading), false to keep looking.
   */
  onBeacon: (text: string) => boolean;
  className?: string;
};

/** True for the Stage's rotating room code (`arena:b1:…`), not passes or other QR codes. */
export function isBeaconQR(text: string): boolean {
  return text.trim().startsWith(QR_PREFIX);
}

/** Camera fallback for the room beacon: reads the small rotating code the Stage shows under the results. */
export function BeaconQRScanner({ onBeacon, className }: BeaconQRScannerProps) {
  const [hint, setHint] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const onScan = (text: string) => {
    if (done) return;
    if (!isBeaconQR(text)) {
      setHint("That's not the room code. Look for the small code under the results on the big screen.");
      return;
    }
    if (onBeacon(text)) {
      setDone(true);
      setHint(null);
    } else {
      setHint("That room code is for a different contest.");
    }
  };

  return (
    <div className={className}>
      <QRScanner
        onScan={onScan}
        paused={done}
        className="squircle aspect-square w-full rounded-lg sm:aspect-4/3"
        explainer="Point your camera at the small code under the results on the big screen. Nothing is recorded or uploaded."
      />
      <p className="text-footnote text-fg-muted mt-3 min-h-5 text-center" aria-live="polite">
        {done ? "Got it. Checking the signal…" : hint}
      </p>
    </div>
  );
}
