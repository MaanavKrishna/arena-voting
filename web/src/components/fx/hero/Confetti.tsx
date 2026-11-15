"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useIsClient, useReducedMotionPref } from "@/components/ui/hooks";

/** design-system §7: canvas, 120 particles in entry colours, 1.8 s, once. */
export const CONFETTI_COUNT = 120;
export const CONFETTI_MS = 1800;

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  vr: number;
  /** Phase of the paper flip (the width scales by cos of this). */
  flip: number;
  vflip: number;
  colour: string;
};

/** Deterministic-ish burst from `origin` (CSS px). `rand` is injectable for tests. */
export function makeParticles(
  count: number,
  origin: { x: number; y: number },
  colours: readonly string[],
  scale: number,
  rand: () => number = Math.random,
): Particle[] {
  const palette = colours.length > 0 ? colours : ["#fff"];
  return Array.from({ length: count }, (_, i) => {
    // Upward fan, ±55° around vertical; speed scales with the screen so 390 and 1440 both fill.
    const angle = -Math.PI / 2 + (rand() - 0.5) * ((110 * Math.PI) / 180);
    const speed = (0.55 + rand() * 0.75) * scale;
    const size = 6 + rand() * 6;
    return {
      x: origin.x + (rand() - 0.5) * 40,
      y: origin.y + (rand() - 0.5) * 16,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      w: size,
      h: size * (0.4 + rand() * 0.3),
      rot: rand() * Math.PI * 2,
      vr: (rand() - 0.5) * 0.02,
      flip: rand() * Math.PI * 2,
      vflip: 0.006 + rand() * 0.01,
      colour: palette[i % palette.length]!,
    };
  });
}

/** Advance one particle by `dt` ms: gravity, air drag, spin. Units: px and px/ms. */
export function stepParticle(p: Particle, dt: number, scale: number): void {
  const gravity = 0.0016 * (scale / 1.2);
  const drag = Math.pow(0.9975, dt);
  p.vx *= drag;
  p.vy = p.vy * drag + gravity * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.rot += p.vr * dt;
  p.flip += p.vflip * dt;
}

/** Opacity over the run: full for the first 65 %, then eased out to 0 at the end. */
export function confettiAlpha(t: number): number {
  if (t <= 0.65) return 1;
  if (t >= 1) return 0;
  const k = (t - 0.65) / 0.35;
  return 1 - k * k;
}

export type ConfettiProps = {
  /** CSS colours, e.g. `var(--color-entry-2)`; resolved against this component's place in the tree. */
  colours: readonly string[];
  /** Shown instead under reduced motion (design-system §6: a static "Winner" badge). */
  fallback?: ReactNode;
  count?: number;
  duration?: number;
  onDone?: () => void;
};

/**
 * One burst of paper confetti from where this component sits (its anchor's centre), drawn on a
 * full-viewport canvas that never takes pointer events. Runs once per mount: remount to replay.
 * DPR-aware, pauses while the tab is hidden, removes its canvas when done. Under reduced motion it
 * draws nothing and renders `fallback` in place.
 */
export function Confetti({ colours, fallback = null, count = CONFETTI_COUNT, duration = CONFETTI_MS, onDone }: ConfettiProps) {
  const mounted = useIsClient();
  const reduce = useReducedMotionPref();
  const [done, setDone] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const coloursRef = useRef(colours);
  const doneRef = useRef(onDone);
  useEffect(() => {
    coloursRef.current = colours;
    doneRef.current = onDone;
  });

  useEffect(() => {
    if (!mounted || reduce) return;
    const canvas = canvasRef.current;
    const anchor = anchorRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !anchor || !ctx) {
      doneRef.current?.();
      return;
    }

    // Resolve tokens (light-dark(), oklch) to concrete colours via a probe inside the themed tree.
    const resolved = coloursRef.current.map((c) => {
      anchor.style.color = c;
      return getComputedStyle(anchor).color || c;
    });
    anchor.style.color = "";

    let width = 0;
    let height = 0;
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();

    const rect = anchor.getBoundingClientRect();
    const origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const scale = Math.max(0.8, Math.min(height / 600, 1.8));
    const particles = makeParticles(count, origin, resolved, scale);

    let elapsed = 0;
    let last: number | null = null;
    let raf = 0;
    let finished = false;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = confettiAlpha(elapsed / duration);
      for (const p of particles) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(Math.cos(p.flip), 1);
        ctx.fillStyle = p.colour;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      ctx.clearRect(0, 0, width, height);
      setDone(true); // unmounts the canvas
      doneRef.current?.();
    };

    const frame = (now: number) => {
      // Cap the step so a long frame (or a tab coming back) doesn't fling the paper off-screen.
      const dt = last === null ? 16 : Math.min(now - last, 34);
      last = now;
      elapsed += dt;
      for (const p of particles) stepParticle(p, dt, scale);
      if (elapsed >= duration) return finish();
      draw();
      raf = requestAnimationFrame(frame);
    };

    const onVisibility = () => {
      cancelAnimationFrame(raf);
      last = null;
      if (!document.hidden && !finished) raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", size);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", size);
      ctx.clearRect(0, 0, width, height);
    };
  }, [mounted, reduce, count, duration]);

  if (reduce) return <>{fallback}</>;
  return (
    <>
      <span ref={anchorRef} aria-hidden data-confetti-anchor="" className="pointer-events-none absolute left-1/2 top-1/2 size-0" />
      {mounted && !done
        ? createPortal(
            <canvas
              ref={canvasRef}
              aria-hidden
              data-testid="confetti"
              className="pointer-events-none fixed inset-0 z-50 size-full"
            />,
            document.body,
          )
        : null}
    </>
  );
}
