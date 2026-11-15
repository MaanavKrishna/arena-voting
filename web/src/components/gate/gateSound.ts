"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Note = { freq: number; at: number; dur: number; type: OscillatorType; gain: number };

const OK: Note[] = [
  { freq: 880, at: 0, dur: 0.09, type: "sine", gain: 0.22 },
  { freq: 1318.5, at: 0.08, dur: 0.16, type: "sine", gain: 0.22 },
];
const NO: Note[] = [
  { freq: 196, at: 0, dur: 0.12, type: "triangle", gain: 0.3 },
  { freq: 185, at: 0.16, dur: 0.16, type: "triangle", gain: 0.3 },
];

function playNotes(ctx: AudioContext, notes: Note[]) {
  const t0 = ctx.currentTime + 0.005;
  for (const n of notes) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = n.type;
    osc.frequency.value = n.freq;
    // short attack and exponential release: a clean chime, no click
    g.gain.setValueAtTime(0.0001, t0 + n.at);
    g.gain.exponentialRampToValueAtTime(n.gain, t0 + n.at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0 + n.at);
    osc.stop(t0 + n.at + n.dur + 0.02);
  }
}

/**
 * Success / reject chimes for the Gate, synthesised with Web Audio (no files to load).
 * Browsers only allow sound after a tap, so call `unlock()` from a pointer handler.
 */
export function useGateSound() {
  const ctx = useRef<AudioContext | null>(null);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(muted);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const unlock = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!ctx.current) {
      const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      ctx.current = new Ctor();
    }
    if (ctx.current.state === "suspended") void ctx.current.resume();
  }, []);

  const play = useCallback((kind: "ok" | "no") => {
    const c = ctx.current;
    if (!c || mutedRef.current || c.state !== "running") return;
    playNotes(c, kind === "ok" ? OK : NO);
  }, []);

  useEffect(
    () => () => {
      void ctx.current?.close();
      ctx.current = null;
    },
    [],
  );

  return { unlock, play, muted, setMuted };
}

/** Same frame as the flash (design-system §6). No-op where vibration isn't supported. */
export function haptic(pattern: number | number[]) {
  if (typeof navigator !== "undefined") navigator.vibrate?.(pattern);
}
