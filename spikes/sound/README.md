# Arena sound spike (throwaway)

Device test for the Ground presence beacon: does ggwave ultrasound reach real phones, and can a webcam read the animated Pass QR? Standalone: not part of the `web/` app or the root pnpm workspace. Nothing is recorded or uploaded.

## Run

```bash
cd spikes/sound
pnpm install --ignore-workspace   # once
lsof -i :5199                      # port must be free
pnpm dev                           # vite --host, port 5199
```

Phones need HTTPS for the microphone and camera. In a second terminal:

```bash
cloudflared tunnel --url http://localhost:5199
# or
ngrok http 5199
```

Open the printed https URL on every device. The top line of the page says whether it is a secure context and which APIs exist. `pnpm build` produces `dist/` (not needed for testing; do not commit it).

## Using the page

- **Protocol picker (top):** one shared selector. Set the same value on the sender and note it for the receiver; results JSON records it.
- **Transmit:** Start (creates the AudioContext on the click), loops the encoded 25-byte payload back-to-back, re-encodes when `floor(unix/10)` changes. Payload: `01` + contestId 3 + slot + 16 deterministic test bytes.
- **Receive:** Listen. Mic with echoCancellation, noiseSuppression and autoGainControl off, mono, AudioContext at native rate, that rate passed to ggwave. Shows each decoded payload (hex), time since mic on, OK counter, decodes per minute, first-decode time. Uses AudioWorklet; decode runs on the main thread (spike shortcut; the real app uses a Worker). Falls back to ScriptProcessorNode if there is no AudioWorklet.
- **Pass QR:** Show pass renders a 259-char text (`arena:p1:` + 250 base64url chars, same size as the real 187-byte pass), error correction M, 360 px canvas, new every 2 s. Scan pass opens the camera and decodes with BarcodeDetector (if present) or `@zxing/browser`; pick the decoder in the dropdown to compare both. Press "Reset timer" as the pass comes into view; "First read" is the time from that reset to the first successful decode.
- **Copy results as JSON:** userAgent, protocol, sample rate, timings, decode log. Paste it back.

## Test matrix (from docs/ground-presence.md, Device spike)

| Transmitter | Receivers | Distances | Rooms | Protocols |
|---|---|---|---|---|
| MacBook speakers, one Bluetooth speaker | iPhone Safari, Android Chrome, any extra phones | 1 m, 5 m, 10 m | Quiet room, noisy room (music or talk at normal volume) | ULTRASOUND_FASTEST, ULTRASOUND_FAST, AUDIBLE_FASTEST (ULTRASOUND_NORMAL is also in the picker) |

Measure per cell: time to first decode, decodes per minute, max working distance. Also record the byte size of a Base Account signature on Sepolia (confirms D-13).

Gate test: laptop webcam reads the animated Pass QR from a phone at 20 to 40 cm in under 1 s?

### Criteria

- **Pass:** noisy room, 5 m, every receiver decodes within 15 s with at least one ultrasound protocol. Ultrasound is primary.
- **Partial:** only audible passes. Audible is primary, ultrasound off.
- **Fail:** neither passes. QR beacon is primary, sound is an optional extra.

Record results in `docs/decisions.md` under D-06.

## ggwave 0.4.0 findings (read from node_modules/ggwave and probed in Node)

- **Package:** one UMD/CommonJS file `ggwave.js` (about 154 KB). `module.exports = ggwave_factory`. Default import in Vite works (`import ggwaveFactory from "ggwave"`). No type definitions.
- **WASM loading:** the WASM binary is embedded in `ggwave.js` as a base64 `data:` URI (single-file Emscripten build). No separate `.wasm` file, no fetch, no bundler config. It also contains guarded Node code that requires `fs` and `path`; Vite warns that they are externalized for browser compatibility. Harmless (the warning appears in `pnpm build`; the page runs fine).
- **Factory:** `ggwaveFactory()` returns a Promise of the module (`ggwave_factory.ready`).
- **Exports:** `getDefaultParameters()`, `init(params)` returns an instance id, `free(instance)`, `encode(instance, data, protocolId, volume)`, `decode(instance, data)`, `enableLog()`, `disableLog()`, `rxToggleProtocol(protocolId, 0|1)`, `txToggleProtocol(...)`, enum `SampleFormat` (`GGWAVE_SAMPLE_FORMAT_{UNDEFINED,U8,I8,U16,I16,F32}`), enum `ProtocolId`, constants `GGWAVE_OPERATING_MODE_{RX,TX,RX_AND_TX,TX_ONLY_TONES,USE_DSS}`.
- **ProtocolId names:** `GGWAVE_PROTOCOL_` + `AUDIBLE_{NORMAL,FAST,FASTEST}`, `ULTRASOUND_{NORMAL,FAST,FASTEST}`, `DT_{NORMAL,FAST,FASTEST}`, `CUSTOM_0..9`. Note the package README shows `TxProtocolId.GGWAVE_TX_PROTOCOL_*`; that is stale. The real name is `ProtocolId.GGWAVE_PROTOCOL_*`.
- **Parameters:** `{payloadLength (-1 = variable), sampleRateInp, sampleRateOut, sampleRate (internal, 48000), samplesPerFrame (1024), soundMarkerThreshold (3), sampleFormatInp, sampleFormatOut, operatingMode (default 6 = RX and TX)}`. Defaults for sample formats are not F32, so set both to `GGWAVE_SAMPLE_FORMAT_F32` to work with Web Audio. The spike sets `payloadLength = 25` (fixed-length mode) and passes the AudioContext rate as `sampleRateInp` (receive) and `sampleRateOut` (transmit).
- **Binary support: YES.** `encode` takes a C++ `std::string`, and Embind accepts a `Uint8Array` for it, so the raw 25 bytes go in directly. Probed in Node for all four protocols: a payload containing 0x00 and 0xFF bytes round-trips byte-exact. `decode` returns a `Uint8Array` view of the decoded bytes (length 0 when nothing decoded), so binary comes back intact. No base64url fallback is needed.
- **Buffer gotchas:** `encode` returns an `Int8Array` view over a static buffer holding the samples as raw bytes (Float32 when sample format is F32): copy it before the next call (`new Float32Array(new Int8Array(wave).buffer)`). `decode` also returns a view over a static 256-byte buffer: copy it. `decode` input must be bytes: pass the Float32 chunk as an `Int8Array` over the same buffer, one `samplesPerFrame` (1024 samples = 4096 bytes) chunk at a time.
- **Encode volume:** 0 to 100. Peak amplitude at 100 is about 0.97 to 1.0 (not clipping). The page encodes at 100 and scales with a GainNode for the slider.
- **Waveform length at 48 kHz (25-byte payload):** ULTRASOUND_FASTEST 0.77 s, ULTRASOUND_FAST 1.54 s, ULTRASOUND_NORMAL 2.30 s, AUDIBLE_FASTEST 0.77 s.
- **Console noise:** the encode wrapper has a `printf` ("n = ..., nActual = ..."), which shows in the browser console on every encode. Harmless.
- **Probed vs not probed:** Node round-trips (48 kHz and 44.1 kHz, all four protocols) pass. Real over-the-air decoding is exactly what this spike is for.

## Verified on the dev machine

- `pnpm build` succeeds; dev server on :5199 serves the page; page loads in headless Chrome with a clean console; Transmit Start encodes and "loops" (real speaker output and microphone capture are not testable headless); Pass QR renders.
