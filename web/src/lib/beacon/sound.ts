/**
 * Data-over-sound for the room beacon, both directions, behind one small interface (D-06).
 * ggwave runs in `sound.worker.ts`; nothing else in the app imports it, so it can be swapped.
 *
 *   Stage:  const tx = await startTransmit({ getPayload, protocol, volume })   // call inside a click
 *           tx.setVolume(0.6); tx.setProtocol("AUDIBLE_FASTEST"); tx.stop();
 *   Phone:  const rx = await startReceive({ onPayload })                       // call inside a tap
 *           rx.stop();
 *
 * Payloads are the raw 25-byte beacon payload (lib/beacon/payload.ts). Browser only.
 */

export type SoundProtocol =
  | "AUDIBLE_NORMAL"
  | "AUDIBLE_FAST"
  | "AUDIBLE_FASTEST"
  | "ULTRASOUND_NORMAL"
  | "ULTRASOUND_FAST"
  | "ULTRASOUND_FASTEST"
  | "DT_NORMAL"
  | "DT_FAST"
  | "DT_FASTEST";

/** Primary protocol (pending the device spike, D-06). */
export const DEFAULT_PROTOCOL: SoundProtocol = "ULTRASOUND_FASTEST";
/** The Stage's "audible" toggle: a short soft chirp. */
export const AUDIBLE_PROTOCOL: SoundProtocol = "AUDIBLE_FASTEST";
/** Phones listen for both, so the Stage can switch without telling them. */
export const DEFAULT_RX_PROTOCOLS: readonly SoundProtocol[] = [DEFAULT_PROTOCOL, AUDIBLE_PROTOCOL];
export const DEFAULT_VOLUME = 0.6;
/** Samples per chunk the AudioWorklet hands to the decoder. */
export const RX_CHUNK = 1024;

// ---- worker protocol (shared with sound.worker.ts) --------------------------------------------

export type WorkerIn =
  | { type: "init" }
  | { type: "encode"; id: number; payload: Uint8Array; protocol: SoundProtocol; sampleRate: number }
  | { type: "rx-start"; sampleRate: number; protocols: SoundProtocol[]; port: MessagePort }
  | { type: "rx-stop" };

export type WorkerOut =
  | { type: "ready" }
  | { type: "encoded"; id: number; samples: Float32Array }
  | { type: "rx-ready" }
  | { type: "decoded"; payload: Uint8Array }
  | { type: "error"; id?: number; message: string };

function createSoundWorker(): Worker {
  // Classic (not module) worker: it loads the vendored ggwave UMD with importScripts (D-06).
  return new Worker(new URL("./sound.worker.ts", import.meta.url), { name: "arena-sound" });
}

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor {
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  const ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!ctor) throw new Error("This browser can't play or record sound.");
  return ctor;
}

export function isSoundSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { AudioContext?: unknown; webkitAudioContext?: unknown };
  return typeof Worker !== "undefined" && Boolean(w.AudioContext ?? w.webkitAudioContext);
}

export function bytesKey(b: Uint8Array | null): string {
  if (!b) return "";
  let s = "";
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
  return s;
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_VOLUME);

// ---- transmit ---------------------------------------------------------------------------------

export type TransmitOptions = {
  /** Called every 250 ms; return the current payload, or null for silence. A new value is re-encoded. */
  getPayload: () => Uint8Array | null;
  protocol?: SoundProtocol;
  /** 0..1, default 0.6. */
  volume?: number;
  /** The waveform for the current payload started looping (payload hex, waveform seconds). */
  onTransmit?: (info: { payloadHex: string; seconds: number; protocol: SoundProtocol }) => void;
  onError?: (message: string) => void;
};

export type TransmitHandle = {
  stop: () => void;
  setVolume: (volume: number) => void;
  setProtocol: (protocol: SoundProtocol) => void;
  /** Taps the output for a live waveform. */
  analyser: AnalyserNode;
  context: AudioContext;
};

/**
 * Starts looping the encoded payload back-to-back. Must be called from a user gesture (autoplay
 * policy): the AudioContext is created synchronously, before the first await.
 */
export async function startTransmit(opts: TransmitOptions): Promise<TransmitHandle> {
  const ctx = new (audioContextCtor())();
  const worker = createSoundWorker();
  const gain = ctx.createGain();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  gain.gain.value = clamp01(opts.volume ?? DEFAULT_VOLUME);
  gain.connect(analyser);
  analyser.connect(ctx.destination);

  let protocol = opts.protocol ?? DEFAULT_PROTOCOL;
  let stopped = false;
  let source: AudioBufferSourceNode | null = null;
  let playingKey = "";
  let wantedKey = "";
  let nextId = 0;
  let pending: { id: number; key: string; hex: string } | null = null;

  const swapSource = (samples: Float32Array | null) => {
    const old = source;
    source = null;
    if (samples && samples.length > 0) {
      const buf = ctx.createBuffer(1, samples.length, ctx.sampleRate);
      buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true; // back-to-back repeats for the whole slot
      src.connect(gain);
      src.start();
      source = src;
    }
    try {
      old?.stop();
    } catch {
      // already stopped
    }
    old?.disconnect();
  };

  worker.onmessage = (e: MessageEvent<WorkerOut>) => {
    const msg = e.data;
    if (stopped) return;
    if (msg.type === "encoded" && pending && msg.id === pending.id) {
      const done = pending;
      pending = null;
      if (done.key !== wantedKey) return; // superseded while encoding; the next tick re-encodes
      swapSource(msg.samples);
      playingKey = done.key;
      opts.onTransmit?.({ payloadHex: done.hex, seconds: msg.samples.length / ctx.sampleRate, protocol });
    } else if (msg.type === "error") {
      if (pending && msg.id === pending.id) pending = null;
      opts.onError?.(msg.message);
    }
  };
  worker.onerror = (e) => opts.onError?.(e.message || "The sound engine failed to load.");

  const tick = () => {
    if (stopped) return;
    let payload: Uint8Array | null = null;
    try {
      payload = opts.getPayload();
    } catch {
      payload = null;
    }
    const hex = bytesKey(payload);
    wantedKey = payload ? `${protocol}|${hex}` : "";
    if (wantedKey === playingKey) return;
    if (!payload) {
      swapSource(null);
      playingKey = "";
      return;
    }
    if (pending) return; // one encode at a time; checked again next tick
    pending = { id: ++nextId, key: wantedKey, hex };
    const msg: WorkerIn = { type: "encode", id: pending.id, payload: payload.slice(), protocol, sampleRate: ctx.sampleRate };
    worker.postMessage(msg);
  };

  await ctx.resume();
  tick();
  const timer = setInterval(tick, 250);

  return {
    analyser,
    context: ctx,
    setVolume(v) {
      gain.gain.setTargetAtTime(clamp01(v), ctx.currentTime, 0.05);
    },
    setProtocol(p) {
      if (p === protocol) return;
      protocol = p;
      tick();
    },
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      swapSource(null);
      worker.terminate();
      void ctx.close().catch(() => {});
    },
  };
}

// ---- receive ----------------------------------------------------------------------------------

// Collects 1024-sample chunks and posts them straight to the decode worker over a MessagePort.
const WORKLET_SOURCE = `
class ArenaCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(${RX_CHUNK});
    this.n = 0;
    this.out = null;
    this.port.onmessage = (e) => { this.out = e.data && e.data.port ? e.data.port : null; };
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && this.out) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i];
        if (this.n === ${RX_CHUNK}) {
          const chunk = this.buf.slice();
          this.out.postMessage(chunk, [chunk.buffer]);
          this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("arena-capture", ArenaCapture);
`;

export type ReceiveState = "listening" | "paused" | "stopped";

export type ReceiveOptions = {
  /** Raw decoded bytes (25 for a beacon payload). Validate with `decodePayload`. */
  onPayload: (payload: Uint8Array) => void;
  /** One protocol, or several to listen for at once. Default: ultrasound + audible fastest. */
  protocol?: SoundProtocol | readonly SoundProtocol[];
  /** "paused" when the browser suspends the mic (iOS: tab hidden, screen locked) → offer "Tap to listen again". */
  onStateChange?: (state: ReceiveState) => void;
  onError?: (message: string) => void;
};

export type ReceiveHandle = { stop: () => void; sampleRate: number };

/**
 * Opens the microphone with voice processing off and decodes in a worker. Must be called from a
 * user gesture. Rejects if the mic is refused (NotAllowedError) or the context isn't secure.
 */
export async function startReceive(opts: ReceiveOptions): Promise<ReceiveHandle> {
  const ctx = new (audioContextCtor())(); // native rate (usually 48 kHz); created inside the gesture
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
  } catch (err) {
    void ctx.close().catch(() => {});
    throw err;
  }

  const worker = createSoundWorker();
  let stopped = false;
  const cleanup: (() => void)[] = [];
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cleanup.forEach((fn) => {
      try {
        fn();
      } catch {
        // best effort
      }
    });
    stream.getTracks().forEach((t) => t.stop());
    worker.terminate();
    void ctx.close().catch(() => {});
    opts.onStateChange?.("stopped");
  };

  try {
    await ctx.resume();
    const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, "arena-capture", { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
    const mute = ctx.createGain();
    mute.gain.value = 0; // keeps the graph pulling without playing the mic back
    source.connect(node);
    node.connect(mute);
    mute.connect(ctx.destination);
    cleanup.push(() => source.disconnect(), () => node.disconnect(), () => mute.disconnect());

    const channel = new MessageChannel();
    node.port.postMessage({ port: channel.port1 }, [channel.port1]);

    const protocols = opts.protocol === undefined ? [...DEFAULT_RX_PROTOCOLS] : typeof opts.protocol === "string" ? [opts.protocol] : [...opts.protocol];
    worker.onmessage = (e: MessageEvent<WorkerOut>) => {
      if (stopped) return;
      if (e.data.type === "decoded") opts.onPayload(e.data.payload);
      else if (e.data.type === "error") opts.onError?.(e.data.message);
    };
    worker.onerror = (e) => opts.onError?.(e.message || "The sound engine failed to load.");
    const start: WorkerIn = { type: "rx-start", sampleRate: ctx.sampleRate, protocols, port: channel.port2 };
    worker.postMessage(start, [channel.port2]);

    ctx.onstatechange = () => {
      if (!stopped) opts.onStateChange?.(ctx.state === "running" ? "listening" : "paused");
    };
    const onTrackEnded = () => !stopped && opts.onStateChange?.("paused");
    stream.getTracks().forEach((t) => t.addEventListener("ended", onTrackEnded));
    opts.onStateChange?.("listening");
  } catch (err) {
    stop();
    throw err;
  }

  return { stop, sampleRate: ctx.sampleRate };
}
