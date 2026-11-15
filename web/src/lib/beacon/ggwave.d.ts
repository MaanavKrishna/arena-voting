/**
 * Types for the parts of ggwave 0.4.0's Emscripten binding that sound.worker.ts uses
 * (node_modules/ggwave/emscripten.cpp). Only the worker imports the module.
 */
declare module "ggwave" {
  export type GgwaveInstance = number;
  type EnumValue = { value: number };

  export type GgwaveParameters = {
    payloadLength: number;
    sampleRateInp: number;
    sampleRateOut: number;
    sampleRate: number;
    samplesPerFrame: number;
    soundMarkerThreshold: number;
    sampleFormatInp: EnumValue;
    sampleFormatOut: EnumValue;
    operatingMode: number;
  };

  export type GgwaveModule = {
    SampleFormat: Record<"GGWAVE_SAMPLE_FORMAT_F32" | "GGWAVE_SAMPLE_FORMAT_I16", EnumValue>;
    ProtocolId: Record<string, EnumValue>;
    GGWAVE_OPERATING_MODE_RX: number;
    GGWAVE_OPERATING_MODE_TX: number;
    getDefaultParameters(): GgwaveParameters;
    init(p: GgwaveParameters): GgwaveInstance;
    free(i: GgwaveInstance): void;
    /** Returns an Int8Array view over a static buffer holding the samples: copy before the next call. */
    encode(i: GgwaveInstance, data: Uint8Array, protocol: EnumValue, volume: number): Int8Array;
    /** Input: Float32 samples viewed as Int8Array. Returns a view over a static buffer (empty if nothing decoded). */
    decode(i: GgwaveInstance, data: Int8Array): Int8Array;
    disableLog(): void;
    rxToggleProtocol(protocol: EnumValue, state: number): void;
  };

  const factory: (overrides?: { print?: (s: string) => void; printErr?: (s: string) => void }) => Promise<GgwaveModule>;
  export default factory;
}
