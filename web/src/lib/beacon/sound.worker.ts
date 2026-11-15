/**
 * ggwave in a Web Worker (D-06). The library is unmaintained and chatty, so it lives here behind
 * the message protocol in `sound.ts`. Encodes payloads to Float32 waveforms for the Stage, and
 * decodes 1024-sample microphone chunks (posted straight from the AudioWorklet over a
 * MessagePort) for phones.
 *
 * Loading (D-06): Turbopack can't bundle the ggwave UMD (its Node branch `require("fs")` fails to
 * resolve in a browser bundle), so the untouched file is copied to /public/vendor/ggwave/ggwave.js
 * and loaded here with importScripts. That needs a classic worker (sound.ts creates one). Its
 * top-level `var ggwave_factory` becomes a worker global.
 *
 * The ggwave calls are plain exported functions so a unit test can round-trip them in Node.
 */
import type { GgwaveInstance, GgwaveModule } from "ggwave";
import type { SoundProtocol, WorkerIn, WorkerOut } from "./sound";

export const GGWAVE_URL = "/vendor/ggwave/ggwave.js";
const PAYLOAD_LENGTH = 25;

type Factory = (o?: { print?: (s: string) => void; printErr?: (s: string) => void }) => Promise<GgwaveModule>;

export const ALL_PROTOCOLS: readonly SoundProtocol[] = [
  "AUDIBLE_NORMAL",
  "AUDIBLE_FAST",
  "AUDIBLE_FASTEST",
  "ULTRASOUND_NORMAL",
  "ULTRASOUND_FAST",
  "ULTRASOUND_FASTEST",
  "DT_NORMAL",
  "DT_FAST",
  "DT_FASTEST",
];

export function protocolId(g: GgwaveModule, p: SoundProtocol) {
  const id = g.ProtocolId[`GGWAVE_PROTOCOL_${p}`];
  if (!id) throw new Error(`unknown protocol ${p}`);
  return id;
}

export function makeInstance(g: GgwaveModule, sampleRate: number, tx: boolean): GgwaveInstance {
  const p = g.getDefaultParameters();
  p.sampleRateInp = sampleRate;
  p.sampleRateOut = sampleRate;
  p.sampleFormatInp = g.SampleFormat.GGWAVE_SAMPLE_FORMAT_F32;
  p.sampleFormatOut = g.SampleFormat.GGWAVE_SAMPLE_FORMAT_F32;
  p.payloadLength = PAYLOAD_LENGTH; // fixed-length mode: fewer false decodes
  p.operatingMode = tx ? g.GGWAVE_OPERATING_MODE_TX : g.GGWAVE_OPERATING_MODE_RX;
  return g.init(p);
}

/** Payload → Float32 waveform (a fresh copy: ggwave returns a view over a static buffer). */
export function encodeSamples(g: GgwaveModule, inst: GgwaveInstance, payload: Uint8Array, protocol: SoundProtocol): Float32Array {
  const view = g.encode(inst, payload, protocolId(g, protocol), 100);
  const bytes = new Uint8Array(view.byteLength);
  bytes.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  return new Float32Array(bytes.buffer, 0, Math.floor(bytes.byteLength / 4));
}

/** Only these protocols are decoded by instances created afterwards (the toggle is global). */
export function selectRxProtocols(g: GgwaveModule, protocols: readonly SoundProtocol[]): void {
  const wanted = new Set(protocols);
  for (const p of ALL_PROTOCOLS) g.rxToggleProtocol(protocolId(g, p), wanted.has(p) ? 1 : 0);
}

/** One chunk of Float32 mic samples → decoded bytes (copied) or null. */
export function decodeChunk(g: GgwaveModule, inst: GgwaveInstance, f32: Float32Array): Uint8Array | null {
  // Keep the official-example detail: Float32 samples handed over as an Int8Array view of the same bytes.
  const out = g.decode(inst, new Int8Array(f32.buffer, f32.byteOffset, f32.byteLength));
  if (out.length === 0) return null;
  const payload = new Uint8Array(out.length);
  payload.set(new Uint8Array(out.buffer, out.byteOffset, out.byteLength));
  return payload;
}

// ---- worker runtime (only inside a worker) ----------------------------------------------------

type Scope = {
  importScripts(...urls: string[]): void;
  ggwave_factory?: Factory;
  postMessage(msg: WorkerOut, transfer: Transferable[]): void;
  onmessage: ((e: MessageEvent<WorkerIn>) => void) | null;
};

function runWorker(scope: Scope) {
  // ggwave prints on every encode ("n = …, nActual = …"). Emscripten binds `print` when the factory
  // runs, so silence this worker's console and pass silent print hooks.
  const noop = () => {};
  console.log = noop;
  console.info = noop;

  let modulePromise: Promise<GgwaveModule> | null = null;
  const ggwave = (): Promise<GgwaveModule> => {
    modulePromise ??= Promise.resolve()
      .then(() => {
        if (!scope.ggwave_factory) scope.importScripts(GGWAVE_URL);
        if (!scope.ggwave_factory) throw new Error("ggwave failed to load");
        return scope.ggwave_factory({ print: noop, printErr: noop });
      })
      .then((g) => {
        g.disableLog();
        return g;
      });
    return modulePromise;
  };

  const post = (msg: WorkerOut, transfer: Transferable[] = []) => scope.postMessage(msg, transfer);
  const txInstances = new Map<number, GgwaveInstance>();
  let rx: { instance: GgwaveInstance; port: MessagePort } | null = null;

  const stopRx = (g: GgwaveModule) => {
    if (!rx) return;
    rx.port.onmessage = null;
    rx.port.close();
    g.free(rx.instance);
    rx = null;
  };

  scope.onmessage = async (e: MessageEvent<WorkerIn>) => {
    const msg = e.data;
    try {
      const g = await ggwave();
      switch (msg.type) {
        case "init":
          post({ type: "ready" });
          return;
        case "encode": {
          let inst = txInstances.get(msg.sampleRate);
          if (inst === undefined) {
            inst = makeInstance(g, msg.sampleRate, true);
            txInstances.set(msg.sampleRate, inst);
          }
          const samples = encodeSamples(g, inst, msg.payload, msg.protocol);
          post({ type: "encoded", id: msg.id, samples }, [samples.buffer]);
          return;
        }
        case "rx-start": {
          stopRx(g);
          selectRxProtocols(g, msg.protocols);
          const instance = makeInstance(g, msg.sampleRate, false);
          const port = msg.port;
          rx = { instance, port };
          port.onmessage = (ev: MessageEvent<Float32Array>) => {
            if (!rx || rx.port !== port) return;
            const payload = decodeChunk(g, instance, ev.data);
            if (payload) post({ type: "decoded", payload }, [payload.buffer]);
          };
          port.start();
          post({ type: "rx-ready" });
          return;
        }
        case "rx-stop":
          stopRx(g);
          return;
      }
    } catch (err) {
      post({ type: "error", id: "id" in msg ? msg.id : undefined, message: err instanceof Error ? err.message : String(err) });
    }
  };
}

const maybeScope = typeof self === "undefined" ? undefined : (self as unknown as Partial<Scope> & { document?: unknown });
if (maybeScope && typeof maybeScope.importScripts === "function" && maybeScope.document === undefined) {
  runWorker(maybeScope as Scope);
}
