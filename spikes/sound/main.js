// Throwaway device spike: ggwave sound transport + animated Pass QR camera test.
import ggwaveFactory from "ggwave";
import QRCode from "qrcode";
import { BrowserQRCodeReader } from "@zxing/browser";

const $ = (id) => document.getElementById(id);
const CONTEST_ID = 3;
const PAYLOAD_LEN = 25;

// ---------- shared state / results ----------
const results = {
  userAgent: navigator.userAgent,
  secureContext: window.isSecureContext,
  startedAt: new Date().toISOString(),
  tx: { protocol: null, volumePct: null, sampleRate: null, waveformMs: null, transmitSecs: 0 },
  rx: { protocol: null, sampleRate: null, engine: null, msUntilFirstDecode: null, decodesOk: 0, decodesPerMinute: 0, decodes: [] },
  qr: { shown: 0, engine: null, firstReadMs: null, distinctReads: 0, reads: [] },
};

const protoName = () => $("proto").value;
const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join("");
const nowSlot = () => Math.floor(Date.now() / 10000);

let ggwave = null;
async function getGgwave() {
  if (!ggwave) {
    ggwave = await ggwaveFactory();
    if (ggwave.disableLog) ggwave.disableLog();
  }
  return ggwave;
}

function makeInstance(g, sampleRate, { tx }) {
  const p = g.getDefaultParameters();
  p.sampleRateInp = sampleRate;
  p.sampleRateOut = sampleRate;
  p.sampleFormatInp = g.SampleFormat.GGWAVE_SAMPLE_FORMAT_F32;
  p.sampleFormatOut = g.SampleFormat.GGWAVE_SAMPLE_FORMAT_F32;
  p.payloadLength = PAYLOAD_LEN; // fixed-length mode: fewer false decodes
  p.operatingMode = tx ? g.GGWAVE_OPERATING_MODE_TX : g.GGWAVE_OPERATING_MODE_RX;
  return g.init(p);
}

// ---------- tabs ----------
document.querySelectorAll(".tabs button").forEach((b) =>
  b.addEventListener("click", () => {
    document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x === b));
    for (const t of ["tx", "rx", "qr"]) $("tab-" + t).classList.toggle("hidden", t !== b.dataset.tab);
  }),
);

$("env").textContent =
  (window.isSecureContext ? "Secure context OK. " : "NOT a secure context: mic and camera will be blocked. Use the HTTPS tunnel. ") +
  ("audioWorklet" in AudioContext.prototype ? "AudioWorklet available. " : "No AudioWorklet (will use ScriptProcessor). ") +
  ("BarcodeDetector" in window ? "BarcodeDetector available." : "No BarcodeDetector (zxing only).");

// ---------- 1. TRANSMIT ----------
// Binary payloads are supported by the ggwave 0.4.0 JS binding (std::string accepts Uint8Array).
$("txmode").textContent = "Payload mode: raw 25 binary bytes (Uint8Array passed straight to ggwave.encode).";

function tokenBytes(slot) {
  // Deterministic test bytes derived from the slot (not a real hash chain).
  const out = new Uint8Array(16);
  let s = (slot ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < 16; i++) {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    out[i] = s & 0xff;
  }
  return out;
}

function buildPayload(slot) {
  const buf = new Uint8Array(PAYLOAD_LEN);
  const dv = new DataView(buf.buffer);
  buf[0] = 0x01;
  dv.setUint32(1, CONTEST_ID);
  dv.setUint32(5, slot);
  buf.set(tokenBytes(slot), 9);
  return buf;
}

const tx = { ctx: null, inst: null, gain: null, analyser: null, src: null, key: "", timer: null, raf: 0, startedAt: 0 };

async function txStart() {
  const g = await getGgwave();
  tx.ctx = new (window.AudioContext || window.webkitAudioContext)(); // created inside the click: autoplay policy
  await tx.ctx.resume();
  tx.inst = makeInstance(g, tx.ctx.sampleRate, { tx: true });
  tx.gain = tx.ctx.createGain();
  tx.analyser = tx.ctx.createAnalyser();
  tx.analyser.fftSize = 1024;
  tx.gain.connect(tx.analyser);
  tx.analyser.connect(tx.ctx.destination);
  txApplyVolume();
  tx.key = "";
  tx.startedAt = performance.now();
  results.tx.sampleRate = tx.ctx.sampleRate;
  txTick();
  tx.timer = setInterval(txTick, 250);
  drawWave();
  $("txbtn").textContent = "Stop";
  $("txbtn").classList.replace("primary", "stop");
  $("txdot").classList.add("live");
}

function txStop() {
  clearInterval(tx.timer);
  cancelAnimationFrame(tx.raf);
  try { tx.src && tx.src.stop(); } catch {}
  results.tx.transmitSecs += Math.round((performance.now() - tx.startedAt) / 1000);
  if (tx.inst && ggwave) ggwave.free(tx.inst);
  tx.ctx && tx.ctx.close();
  Object.assign(tx, { ctx: null, inst: null, src: null, key: "" });
  $("txbtn").textContent = "Start";
  $("txbtn").classList.replace("stop", "primary");
  $("txdot").classList.remove("live");
  $("txstate").textContent = "Idle";
}

function txApplyVolume() {
  const v = Number($("vol").value);
  $("volv").textContent = v;
  results.tx.volumePct = v;
  if (tx.gain) tx.gain.gain.value = v / 100;
}

function txTick() {
  if (!tx.ctx) return;
  const slot = nowSlot();
  const proto = protoName();
  const key = slot + "|" + proto;
  if (key === tx.key) return;
  tx.key = key;
  const payload = buildPayload(slot);
  const t0 = performance.now();
  const wave = ggwave.encode(tx.inst, payload, ggwave.ProtocolId["GGWAVE_PROTOCOL_" + proto], 100);
  // wave is an Int8Array view over a static buffer holding Float32 samples: copy before use.
  const f32 = new Float32Array(new Int8Array(wave).buffer);
  const encMs = Math.round(performance.now() - t0);
  const buf = tx.ctx.createBuffer(1, f32.length, tx.ctx.sampleRate);
  buf.copyToChannel(f32, 0);
  const src = tx.ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true; // back-to-back repeats
  src.connect(tx.gain);
  src.start();
  try { tx.src && tx.src.stop(); } catch {}
  tx.src = src;
  results.tx.protocol = proto;
  results.tx.waveformMs = Math.round((f32.length / tx.ctx.sampleRate) * 1000);
  $("txslot").textContent = slot;
  $("txdur").textContent = results.tx.waveformMs + " ms";
  $("txhex").textContent = "payload " + hex(payload) + " (encode " + encMs + " ms)";
  $("txstate").textContent = "Transmitting " + proto + " (looping)";
}

function drawWave() {
  const c = $("wave");
  const cx = c.getContext("2d");
  const data = new Uint8Array(tx.analyser.fftSize);
  const frame = () => {
    if (!tx.analyser) return;
    tx.analyser.getByteTimeDomainData(data);
    cx.clearRect(0, 0, c.width, c.height);
    cx.strokeStyle = "#7aa2ff";
    cx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = (i / data.length) * c.width;
      const y = (data[i] / 255) * c.height;
      i ? cx.lineTo(x, y) : cx.moveTo(x, y);
    }
    cx.stroke();
    tx.raf = requestAnimationFrame(frame);
  };
  frame();
}

$("txbtn").addEventListener("click", () => (tx.ctx ? txStop() : txStart().catch((e) => ($("txstate").textContent = "Error: " + e.message))));
$("vol").addEventListener("input", txApplyVolume);
$("proto").addEventListener("change", () => {
  results.rx.protocol = protoName();
  if (rx.ctx) $("rxproto").textContent = protoName();
});

// ---------- 2. RECEIVE ----------
const WORKLET_SRC = `
class Cap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(1024); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i];
        if (this.n === 1024) { this.port.postMessage(this.buf.slice()); this.n = 0; }
      }
    }
    return true;
  }
}
registerProcessor("arena-cap", Cap);`;

const rx = { ctx: null, stream: null, inst: null, node: null, t0: 0, ok: 0, timer: null, mode: "" };

async function rxStart() {
  const g = await getGgwave();
  $("rxinfo").textContent = "Asking for the microphone...";
  rx.stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
  });
  rx.ctx = new (window.AudioContext || window.webkitAudioContext)(); // native rate
  await rx.ctx.resume();
  const rate = rx.ctx.sampleRate;
  rx.inst = makeInstance(g, rate, { tx: false }); // input sample rate passed to ggwave
  const src = rx.ctx.createMediaStreamSource(rx.stream);
  const mute = rx.ctx.createGain();
  mute.gain.value = 0;
  const onChunk = (f32) => {
    // Official-example detail: hand ggwave the Float32 buffer as an Int8Array view of the same bytes.
    const r = g.decode(rx.inst, new Int8Array(f32.buffer, f32.byteOffset, f32.byteLength));
    if (r && r.length > 0) onDecoded(new Uint8Array(r)); // copy: r is a view over a static buffer
  };
  if (rx.ctx.audioWorklet) {
    const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: "application/javascript" }));
    await rx.ctx.audioWorklet.addModule(url);
    rx.node = new AudioWorkletNode(rx.ctx, "arena-cap", { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
    rx.node.port.onmessage = (e) => onChunk(e.data);
    rx.mode = "AudioWorklet";
  } else {
    // Fallback for the spike: deprecated ScriptProcessorNode, decode on the main thread.
    rx.node = rx.ctx.createScriptProcessor(1024, 1, 1);
    rx.node.onaudioprocess = (e) => onChunk(new Float32Array(e.inputBuffer.getChannelData(0)));
    rx.mode = "ScriptProcessor (fallback)";
  }
  src.connect(rx.node);
  rx.node.connect(mute);
  mute.connect(rx.ctx.destination);

  rx.t0 = performance.now();
  rx.ok = 0;
  Object.assign(results.rx, { protocol: protoName(), sampleRate: rate, engine: rx.mode, msUntilFirstDecode: null, decodesOk: 0, decodesPerMinute: 0, decodes: [] });
  $("rxproto").textContent = protoName();
  $("rxinfo").textContent = `Listening. ${rx.mode}, ${rate} Hz, voice processing off. Times count from mic on.`;
  $("rxlog").innerHTML = "";
  $("rxok").textContent = "0";
  $("rxfirst").textContent = "-";
  rx.timer = setInterval(rxStats, 500);
  $("rxbtn").textContent = "Stop listening";
  $("rxbtn").classList.replace("primary", "stop");
  rx.ctx.onstatechange = () => {
    if (rx.ctx && rx.ctx.state !== "running") $("rxinfo").textContent = "Audio paused by the browser. Tap Stop, then Listen again.";
  };
}

function rxStop() {
  clearInterval(rx.timer);
  try { rx.node && rx.node.disconnect(); } catch {}
  rx.stream && rx.stream.getTracks().forEach((t) => t.stop());
  if (rx.inst && ggwave) ggwave.free(rx.inst);
  rx.ctx && rx.ctx.close();
  Object.assign(rx, { ctx: null, stream: null, inst: null, node: null });
  $("rxbtn").textContent = "Listen";
  $("rxbtn").classList.replace("stop", "primary");
  $("rxinfo").textContent = "Mic is off.";
}

function onDecoded(bytes) {
  const ms = Math.round(performance.now() - rx.t0);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const valid = bytes.length === PAYLOAD_LEN && bytes[0] === 1 && dv.getUint32(1) === CONTEST_ID;
  const slot = bytes.length === PAYLOAD_LEN ? dv.getUint32(5) : null;
  const ageS = slot === null ? null : Math.round(Date.now() / 1000 - slot * 10);
  if (valid) rx.ok++;
  const rec = { payloadHex: hex(bytes), ms, valid, slot, slotAgeS: ageS };
  if (results.rx.decodes.length < 500) results.rx.decodes.push(rec);
  results.rx.decodesOk = rx.ok;
  if (valid && results.rx.msUntilFirstDecode === null) {
    results.rx.msUntilFirstDecode = ms;
    $("rxfirst").textContent = (ms / 1000).toFixed(1) + "s";
  }
  const row = document.createElement("div");
  row.innerHTML = `<span class="${valid ? "ok" : "bad"}">${valid ? "OK" : "BAD"}</span> +${(ms / 1000).toFixed(1)}s <span class="dim">slot age ${ageS}s</span><div class="hex">${rec.payloadHex}</div>`;
  $("rxlog").prepend(row);
  rxStats();
}

function rxStats() {
  if (!rx.ctx) return;
  const el = (performance.now() - rx.t0) / 1000;
  const pm = el > 0 ? rx.ok / (el / 60) : 0;
  results.rx.decodesPerMinute = Math.round(pm * 10) / 10;
  $("rxok").textContent = rx.ok;
  $("rxpm").textContent = pm.toFixed(1);
  $("rxel").textContent = Math.round(el) + "s";
}

$("rxbtn").addEventListener("click", () => (rx.ctx ? rxStop() : rxStart().catch((e) => ($("rxinfo").textContent = "Error: " + e.message))));
document.addEventListener("visibilitychange", () => {
  if (document.hidden && rx.ctx) $("rxinfo").textContent = "Tab hidden: mic may pause. Tap Stop, then Listen again.";
});

// ---------- 3. PASS QR ----------
const b64url = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const randomPass = () => "arena:p1:" + b64url(crypto.getRandomValues(new Uint8Array(187))); // 187 bytes -> 250 chars

let qrTimer = null;
async function renderPass() {
  const text = randomPass();
  const box = $("qrbox");
  let cv = box.querySelector("canvas");
  if (!cv) { cv = document.createElement("canvas"); box.appendChild(cv); }
  await QRCode.toCanvas(cv, text, { errorCorrectionLevel: "M", width: 360, margin: 2 });
  results.qr.shown++;
  $("qrinfo").textContent = `Frame #${results.qr.shown}, ${text.length} chars, canvas ${cv.width}px. Changes every 2 s.`;
  window.__lastPass = text;
}
$("qrshow").addEventListener("click", () => {
  if (qrTimer) {
    clearInterval(qrTimer); qrTimer = null;
    $("qrbox").innerHTML = ""; $("qrshow").textContent = "Show pass";
    return;
  }
  renderPass();
  qrTimer = setInterval(renderPass, 2000);
  $("qrshow").textContent = "Hide pass";
});

const engSel = $("qrengine");
const hasBD = "BarcodeDetector" in window;
engSel.innerHTML = (hasBD ? '<option value="bd">BarcodeDetector (native)</option>' : "") + '<option value="zxing">@zxing/browser</option>';

const scan = { stream: null, controls: null, stop: false, t0: 0, last: "" };

function scanReset() {
  scan.t0 = performance.now();
  scan.last = "";
  results.qr.firstReadMs = null;
  $("qrfirst").textContent = "-";
}
$("qrreset").addEventListener("click", scanReset);

function onQrText(text, decodeMs) {
  if (!text || text === scan.last) return;
  scan.last = text;
  const ms = Math.round(performance.now() - scan.t0);
  results.qr.distinctReads++;
  if (results.qr.firstReadMs === null) {
    results.qr.firstReadMs = ms;
    $("qrfirst").textContent = ms + " ms";
  }
  if (results.qr.reads.length < 200) results.qr.reads.push({ msSinceTimerStart: ms, decodeCallMs: decodeMs ?? null, chars: text.length, engine: results.qr.engine });
  $("qrcount").textContent = results.qr.distinctReads;
  const row = document.createElement("div");
  row.innerHTML = `<span class="ok">READ</span> +${ms} ms${decodeMs != null ? ` <span class="dim">(decode call ${decodeMs} ms)</span>` : ""} <span class="dim">${text.length} chars</span>`;
  $("qrlog").prepend(row);
}

async function scanStart() {
  const video = $("qrvideo");
  video.classList.remove("hidden");
  const engine = engSel.value;
  results.qr.engine = engine === "bd" ? "BarcodeDetector" : "@zxing/browser";
  results.qr.distinctReads = 0;
  results.qr.reads = [];
  $("qrcount").textContent = "0";
  $("qrlog").innerHTML = "";
  scanReset();
  scan.stop = false;
  const constraints = { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };
  if (engine === "bd") {
    scan.stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = scan.stream;
    await video.play();
    const det = new BarcodeDetector({ formats: ["qr_code"] });
    const loop = async () => {
      if (scan.stop) return;
      if (video.readyState >= 2) {
        const t = performance.now();
        try {
          const codes = await det.detect(video);
          if (codes.length) onQrText(codes[0].rawValue, Math.round(performance.now() - t));
        } catch {}
      }
      requestAnimationFrame(loop);
    };
    loop();
  } else {
    const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 30, delayBetweenScanSuccess: 30 });
    scan.controls = await reader.decodeFromConstraints(constraints, video, (result) => {
      if (result) onQrText(result.getText(), null);
    });
  }
  $("qrscan").textContent = "Stop scanning";
  $("qrscan").classList.replace("primary", "stop");
  $("qrscaninfo").textContent = `Scanning with ${results.qr.engine}. Timer started now; press Reset as the pass comes into view.`;
}

function scanStop() {
  scan.stop = true;
  scan.controls && scan.controls.stop();
  scan.stream && scan.stream.getTracks().forEach((t) => t.stop());
  $("qrvideo").srcObject = null;
  $("qrvideo").classList.add("hidden");
  Object.assign(scan, { controls: null, stream: null });
  $("qrscan").textContent = "Scan pass";
  $("qrscan").classList.replace("stop", "primary");
  $("qrscaninfo").textContent = "";
}
let scanning = false;
$("qrscan").addEventListener("click", async () => {
  try {
    if (scanning) { scanStop(); scanning = false; } else { scanning = true; await scanStart(); }
  } catch (e) {
    scanning = false;
    $("qrscaninfo").textContent = "Error: " + e.message;
  }
});

// ---------- results ----------
function renderJson() {
  results.capturedAt = new Date().toISOString();
  $("json").value = JSON.stringify(results, null, 2);
}
setInterval(renderJson, 1000);
renderJson();
$("copy").addEventListener("click", async () => {
  renderJson();
  try {
    await navigator.clipboard.writeText($("json").value);
    $("copy").textContent = "Copied";
  } catch {
    $("json").select();
    document.execCommand("copy");
    $("copy").textContent = "Copied (fallback)";
  }
  setTimeout(() => ($("copy").textContent = "Copy results as JSON"), 1500);
});
