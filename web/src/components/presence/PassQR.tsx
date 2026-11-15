"use client";

import { motion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { useReducedMotionPref } from "@/components/ui/hooks";
import { cn } from "@/lib/cn";
import { TICK_SECONDS } from "@/lib/pass";

/** Smallest width the Pass is drawn at (docs/ground-presence.md: EC level M, ≥ 280 px). */
export const PASS_QR_MIN_SIZE = 280;

/**
 * The live door pass as a QR code. Always dark modules on a light card (cameras read that best),
 * redrawn whenever `value` changes; the bar underneath sweeps once per 2 s tick so it reads as live.
 * The frame swaps instantly: a cross-fade would blend two codes and slow the scanner down.
 */
export function PassQR({
  value,
  size = 296,
  label = "Your door pass. Hold it up to the gate camera.",
  className,
}: {
  value: string;
  size?: number;
  label?: string;
  className?: string;
}) {
  const px = Math.max(size, PASS_QR_MIN_SIZE);
  const reduce = useReducedMotionPref();

  return (
    <figure
      data-theme="light"
      className={cn("bg-bg-elevated text-fg squircle mx-auto w-fit rounded-lg p-4 shadow-lg", className)}
    >
      <QRCodeSVG
        value={value}
        size={px}
        level="M"
        marginSize={2}
        fgColor="currentColor"
        bgColor="transparent"
        role="img"
        aria-label={label}
        className="block"
      />
      <div aria-hidden className="bg-fg/8 mx-auto mt-3 h-1 w-full overflow-hidden rounded-full">
        {reduce ? (
          <div className="bg-verified h-full w-full opacity-70" />
        ) : (
          <motion.div
            key={value}
            className="bg-verified h-full w-full origin-left"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: TICK_SECONDS, ease: "linear" }}
          />
        )}
      </div>
    </figure>
  );
}
