"use client";

import { QrCode, RotateCw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { ListeningOrb, type OrbState } from "@/components/fx/ListeningOrb";
import { Button } from "@/components/ui/Button";
import { useReducedMotionPref } from "@/components/ui/hooks";
import type { MicProblem, PresenceStatus, RejectReason } from "@/hooks/usePresence";
import { rejectCopy } from "@/hooks/usePresence";
import { cn } from "@/lib/cn";
import { fade, spring } from "@/lib/motion";
import { MicExplainer, micAlreadyGranted, micExplained } from "./MicExplainer";

export type PresenceChipProps = {
  status: PresenceStatus;
  /** Whether the mic is running (decides the stale copy). */
  micOn?: boolean;
  micProblem?: MicProblem | null;
  /** Age of the current token in ms. */
  ageMs?: number | null;
  /** Still holding a valid token (paused while in the room). */
  inRoom?: boolean;
  rejected?: RejectReason | null;
  /** Ripple counter for the orb. */
  pulse?: number;
  /** Start listening. Called from the tap. */
  onListen: () => void;
  /** Open the camera fallback. */
  onScan: () => void;
  /** Skip the mic explainer (tests; already explained). */
  explained?: boolean;
  className?: string;
};

type View = {
  orb: OrbState;
  title: string;
  detail?: string;
  tone?: "verified" | "warning";
  action?: ReactNode;
};

export function ageLabel(ms: number | null | undefined): string {
  if (ms == null) return "";
  const s = Math.floor(ms / 1000);
  return s < 5 ? "Signal heard just now" : `Signal heard ${s} s ago`;
}

function deniedTitle(problem: MicProblem | null | undefined): string {
  switch (problem) {
    case "unsupported":
      return "This phone can't listen here";
    case "insecure":
      return "Listening needs a secure page";
    case "failed":
      return "The microphone didn't start";
    default:
      return "Microphone is off";
  }
}

/**
 * The phone's "am I in the room?" chip. Glass-thin, ListeningOrb on the left, one action on the
 * right. idle → listening → in-room ✓ → stale; mic-denied and offer-qr point at the QR fallback;
 * paused asks for one tap to listen again.
 */
export function PresenceChip({
  status,
  micOn = false,
  micProblem,
  ageMs,
  inRoom = false,
  rejected,
  pulse = 0,
  onListen,
  onScan,
  explained,
  className,
}: PresenceChipProps) {
  const reduce = useReducedMotionPref();
  const [explaining, setExplaining] = useState(false);

  const startListening = () => {
    if (explained || micExplained()) {
      onListen();
      return;
    }
    // A mic that's already allowed won't prompt, so there is nothing to explain.
    void micAlreadyGranted().then((granted) => (granted ? onListen() : setExplaining(true)));
  };

  const scanButton = (label = "Scan the screen") => (
    <Button
      size="sm"
      variant="secondary"
      onClick={onScan}
      icon={<QrCode className="size-4" strokeWidth={1.75} aria-hidden />}
    >
      {label}
    </Button>
  );

  const waitingDetail = rejected ? rejectCopy(rejected) : "Keep this page open near the stage.";

  let view: View;
  switch (status) {
    case "idle":
      view = {
        orb: "idle",
        title: "Prove you're in the room",
        detail: rejected ? rejectCopy(rejected, false) : "Your phone listens for the signal from the stage.",
        action: (
          <Button size="sm" onClick={startListening}>
            Listen
          </Button>
        ),
      };
      break;
    case "requesting-mic":
      view = {
        orb: "idle",
        title: "Allow the microphone",
        detail: "Choose Allow when your browser asks.",
      };
      break;
    case "listening":
      view = {
        orb: "listening",
        title: "Listening for the room…",
        detail: waitingDetail,
      };
      break;
    case "validating":
      view = {
        orb: "listening",
        title: "Checking the signal…",
        detail: "One moment.",
      };
      break;
    case "offer-qr":
      view = {
        orb: "listening",
        title: "Listening for the room…",
        detail: rejected ? rejectCopy(rejected) : "Can't hear it? Scan the code on the big screen.",
        action: scanButton(),
      };
      break;
    case "in-room":
      view = {
        orb: "verified",
        title: "In the room",
        detail: ageLabel(ageMs),
        tone: "verified",
      };
      break;
    case "stale":
      view = {
        orb: micOn ? "listening" : "idle",
        title: "Lost the room signal",
        detail: micOn ? "Listening again…" : "Scan the code on the big screen again.",
        tone: "warning",
        action: micOn ? scanButton() : scanButton("Scan again"),
      };
      break;
    case "mic-denied":
      view = {
        orb: "idle",
        title: deniedTitle(micProblem),
        detail: rejected ? rejectCopy(rejected, false) : "You can scan the code on the big screen instead.",
        action: scanButton("Scan the screen instead"),
      };
      break;
    case "paused":
      view = {
        orb: inRoom ? "verified" : "idle",
        title: "Listening paused",
        detail: inRoom ? "You're still in the room for now." : "Your browser paused the microphone.",
        action: (
          <Button size="sm" onClick={onListen} icon={<RotateCw className="size-4" strokeWidth={1.75} aria-hidden />}>
            Tap to listen again
          </Button>
        ),
      };
      break;
  }

  const showExplainer = explaining && status === "idle";

  return (
    <motion.div
      layout={!reduce}
      transition={spring.smooth}
      data-presence-chip=""
      data-state={status}
      className={cn("glass-thin squircle rounded-md px-3.5 py-3 shadow-sm", className)}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {showExplainer ? (
          <motion.div
            key="explain"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fade}
          >
            <MicExplainer
              onAllow={() => {
                setExplaining(false);
                onListen();
              }}
              onCancel={() => setExplaining(false)}
            />
          </motion.div>
        ) : (
          <motion.div
            key="chip"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fade}
            className="flex items-center gap-3"
          >
            <span className="grid size-9 shrink-0 place-items-center">
              <ListeningOrb state={view.orb} pulseKey={pulse} />
            </span>
            <div className="min-w-0 flex-1" role="status" aria-live="polite">
              <p
                className={cn(
                  "text-callout font-medium",
                  view.tone === "verified"
                    ? "text-verified-text"
                    : view.tone === "warning"
                      ? "text-warning-text"
                      : "text-fg",
                )}
              >
                {view.title}
                {view.tone === "verified" ? <span className="sr-only">, verified</span> : null}
              </p>
              {view.detail ? <p className="text-footnote text-fg-muted line-clamp-2 tabular">{view.detail}</p> : null}
            </div>
            {view.action ? <div className="shrink-0">{view.action}</div> : null}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
