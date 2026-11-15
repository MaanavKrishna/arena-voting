"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_PROTOCOL, DEFAULT_VOLUME, startTransmit, type SoundProtocol, type TransmitHandle } from "@/lib/beacon/sound";

export type TransmitStatus = "off" | "starting" | "on" | "error";

/**
 * Sound side of the Stage. `start()` must run inside the Start beacon click (autoplay policy).
 * The payload is read through a ref every 250 ms, so a new slot re-encodes without restarting.
 */
export function useTransmitter(payload: Uint8Array | null) {
  const payloadRef = useRef(payload);
  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);

  const handle = useRef<TransmitHandle | null>(null);
  const [status, setStatus] = useState<TransmitStatus>("off");
  const [error, setError] = useState<string | null>(null);
  const [protocol, setProtocolState] = useState<SoundProtocol>(DEFAULT_PROTOCOL);
  const [volume, setVolumeState] = useState(DEFAULT_VOLUME);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [lastSent, setLastSent] = useState<{ payloadHex: string; seconds: number } | null>(null);
  const settings = useRef({ protocol, volume });
  useEffect(() => {
    settings.current = { protocol, volume };
  }, [protocol, volume]);

  const start = useCallback(() => {
    if (handle.current) return;
    setStatus("starting");
    setError(null);
    startTransmit({
      getPayload: () => payloadRef.current,
      protocol: settings.current.protocol,
      volume: settings.current.volume,
      onTransmit: (info) => setLastSent({ payloadHex: info.payloadHex, seconds: info.seconds }),
      onError: (message) => {
        setError(message);
        setStatus("error");
      },
    })
      .then((h) => {
        handle.current = h;
        setAnalyser(h.analyser);
        setStatus("on");
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Sound couldn't start.");
        setStatus("error");
      });
  }, []);

  const stop = useCallback(() => {
    handle.current?.stop();
    handle.current = null;
    setAnalyser(null);
    setLastSent(null);
    setStatus("off");
  }, []);

  useEffect(() => () => handle.current?.stop(), []);

  const setProtocol = useCallback((p: SoundProtocol) => {
    setProtocolState(p);
    handle.current?.setProtocol(p);
  }, []);
  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    handle.current?.setVolume(v);
  }, []);

  return { status, error, protocol, volume, analyser, lastSent, start, stop, setProtocol, setVolume };
}

export type Transmitter = ReturnType<typeof useTransmitter>;
