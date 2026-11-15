"use client";

import { Camera, CameraOff, SwitchCamera } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useReducedMotionPref } from "@/components/ui/hooks";
import { cn } from "@/lib/cn";
import { fade, spring } from "@/lib/motion";

// Camera QR reader. BarcodeDetector where the browser has it (Chrome, Android), else @zxing/browser.
// The camera is never opened without a tap on the explainer's button (design-system §11).

export type ScannerStatus = "idle" | "starting" | "live" | "denied" | "unavailable" | "error";

type DetectedCode = { rawValue: string };
type Detector = { detect: (source: CanvasImageSource) => Promise<DetectedCode[]> };
type DetectorCtor = {
  new (opts: { formats: string[] }): Detector;
  getSupportedFormats?: () => Promise<string[]>;
};

/** How often BarcodeDetector looks at a frame. The Pass changes every 2 s; 8 reads a second is plenty. */
const DETECT_INTERVAL_MS = 120;
/** The same text reported again within this window is dropped (the Gate de-dupes too). */
const REPEAT_MS = 400;

async function nativeDetector(): Promise<Detector | null> {
  const Ctor = (globalThis as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    const formats = (await Ctor.getSupportedFormats?.()) ?? ["qr_code"];
    return formats.includes("qr_code") ? new Ctor({ formats: ["qr_code"] }) : null;
  } catch {
    return null;
  }
}

export function classifyCameraError(err: unknown): ScannerStatus {
  const name = err && typeof err === "object" && "name" in err ? String((err as { name: unknown }).name) : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "NotReadableError") return "unavailable";
  return "error";
}

export type QRScannerProps = {
  onScan: (text: string) => void;
  /** Keep the camera on but stop reading (e.g. while a result is on screen). */
  paused?: boolean;
  /** Start the camera without the explainer (only after the person already said yes once). */
  autoStart?: boolean;
  /** What the explainer says before the browser asks for the camera. */
  explainer?: ReactNode;
  /** Shown over the live video, e.g. a frame or a status line. */
  overlay?: ReactNode;
  onStatusChange?: (status: ScannerStatus) => void;
  className?: string;
};

export function QRScanner({
  onScan,
  paused = false,
  autoStart = false,
  explainer,
  overlay,
  onStatusChange,
  className,
}: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<ScannerStatus>("idle");
  const [mirrored, setMirrored] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [deviceIdx, setDeviceIdx] = useState<number | null>(null);
  const [run, setRun] = useState(autoStart ? 1 : 0);
  const reduce = useReducedMotionPref();

  const handlers = useRef({ onScan, paused, onStatusChange });
  useEffect(() => {
    handlers.current = { onScan, paused, onStatusChange };
  });

  const report = useCallback((s: ScannerStatus) => {
    setStatus(s);
    handlers.current.onStatusChange?.(s);
  }, []);

  useEffect(() => {
    if (run === 0) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let zxingStop: (() => void) | undefined;
    let last = { text: "", at: 0 };
    const videoEl = videoRef.current;

    const emit = (text: string) => {
      if (cancelled || handlers.current.paused || document.hidden) return;
      const now = performance.now();
      if (text === last.text && now - last.at < REPEAT_MS) return;
      last = { text, at: now };
      handlers.current.onScan(text);
    };

    (async () => {
      report("starting");
      if (!navigator.mediaDevices?.getUserMedia) {
        report(window.isSecureContext ? "unavailable" : "denied");
        return;
      }
      try {
        const device = deviceIdx !== null ? cameras[deviceIdx] : undefined;
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: device
            ? { deviceId: { exact: device.deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch (err) {
        if (!cancelled) report(classifyCameraError(err));
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = videoEl;
      if (!video) return;
      video.srcObject = stream;
      const settings = stream.getVideoTracks()[0]?.getSettings();
      // Front cameras and laptop webcams read as a mirror; the rear camera doesn't.
      setMirrored(settings?.facingMode !== "environment");
      try {
        await video.play();
      } catch {
        // autoplay of a muted inline video is allowed; ignore a play() interrupted by unmount
      }
      if (cancelled) return;
      report("live");
      navigator.mediaDevices
        .enumerateDevices()
        .then((all) => !cancelled && setCameras(all.filter((d) => d.kind === "videoinput")))
        .catch(() => {});

      const detector = await nativeDetector();
      if (cancelled) return;
      if (detector) {
        const loop = async () => {
          if (cancelled) return;
          if (!handlers.current.paused && video.readyState >= 2) {
            try {
              const codes = await detector.detect(video);
              for (const c of codes) emit(c.rawValue);
            } catch {
              // a frame that can't be read; try the next one
            }
          }
          timer = setTimeout(loop, DETECT_INTERVAL_MS);
        };
        void loop();
      } else {
        try {
          const { BrowserQRCodeReader } = await import("@zxing/browser");
          if (cancelled || !stream) return;
          const controls = await new BrowserQRCodeReader(undefined, {
            delayBetweenScanAttempts: DETECT_INTERVAL_MS,
          }).decodeFromStream(stream, video, (result) => {
            if (result) emit(result.getText());
          });
          zxingStop = () => controls.stop();
          if (cancelled) zxingStop();
        } catch {
          if (!cancelled) report("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      zxingStop?.();
      stream?.getTracks().forEach((t) => t.stop());
      if (videoEl) videoEl.srcObject = null;
    };
    // `cameras` is read only when the person switches camera (deviceIdx changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, deviceIdx, report]);

  const start = () => setRun((n) => n + 1);
  const flip = () => setDeviceIdx((i) => ((i ?? -1) + 1) % Math.max(cameras.length, 1));
  const live = status === "live";

  return (
    <div
      data-scanner-status={status}
      className={cn("bg-bg-sunken relative isolate overflow-hidden", className)}
    >
      <video
        ref={videoRef}
        muted
        playsInline
        aria-label="Camera preview"
        className={cn(
          "absolute inset-0 size-full object-cover transition-opacity duration-300",
          live ? "opacity-100" : "opacity-0",
          mirrored && "-scale-x-100",
        )}
      />
      {live ? overlay : null}

      <AnimatePresence initial={false}>
        {!live ? (
          <motion.div
            key={status}
            initial={{ opacity: 0, y: reduce ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={reduce ? fade : spring.smooth}
            className="absolute inset-0 grid place-items-center p-6 text-center"
          >
            <ScannerMessage status={status} explainer={explainer} onStart={start} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {live && cameras.length > 1 ? (
        <Button
          size="sm"
          variant="secondary"
          onClick={flip}
          className="absolute top-3 right-3 z-10 rounded-full"
          icon={<SwitchCamera className="size-4" strokeWidth={1.75} aria-hidden />}
        >
          Switch camera
        </Button>
      ) : null}
    </div>
  );
}

function ScannerMessage({
  status,
  explainer,
  onStart,
}: {
  status: ScannerStatus;
  explainer?: ReactNode;
  onStart: () => void;
}) {
  if (status === "starting") {
    return (
      <div className="text-fg-muted flex flex-col items-center gap-3" role="status">
        <Spinner className="size-6" />
        <p className="text-callout">Opening the camera…</p>
        <p className="text-footnote">If your browser asks, choose Allow.</p>
      </div>
    );
  }
  const problem =
    status === "denied"
      ? {
          title: "Camera is blocked",
          body: "Allow camera access for this site in your browser's settings, then try again. On phones the camera only works over a secure (https) link.",
        }
      : status === "unavailable"
        ? { title: "No camera found", body: "Connect a camera, or close other apps that are using it, then try again." }
        : status === "error"
          ? { title: "The camera stopped", body: "Try again. If it keeps happening, reload the page." }
          : null;

  return (
    <div className="flex max-w-xs flex-col items-center gap-3">
      <span
        aria-hidden
        className={cn(
          "grid size-12 place-items-center rounded-full",
          problem ? "bg-danger/12 text-danger-text" : "bg-accent/14 text-accent",
        )}
      >
        {problem ? <CameraOff className="size-6" strokeWidth={1.75} /> : <Camera className="size-6" strokeWidth={1.75} />}
      </span>
      <p className="text-title-3 text-fg">{problem ? problem.title : "Use the camera to scan"}</p>
      <div className="text-callout text-fg-muted text-pretty" role={problem ? "alert" : undefined}>
        {problem
          ? problem.body
          : (explainer ?? "Arena reads QR codes with your camera. Nothing is recorded or uploaded.")}
      </div>
      <Button onClick={onStart} className="mt-1" icon={<Camera className="size-4" strokeWidth={1.75} aria-hidden />}>
        {problem ? "Try again" : "Turn on camera"}
      </Button>
    </div>
  );
}
