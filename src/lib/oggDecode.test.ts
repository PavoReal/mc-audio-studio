import { afterEach, describe, expect, it, vi } from "vitest";

const decodeFile = vi.fn();
const free = vi.fn();
const constructed = vi.fn();

vi.mock("@wasm-audio-decoders/ogg-vorbis", () => ({
  OggVorbisDecoder: class {
    ready = Promise.resolve();
    free = free;
    decodeFile = decodeFile;
    constructor() { constructed(); }
  }
}));

class FakeAudioBuffer {
  length: number;
  numberOfChannels: number;
  sampleRate: number;
  private channels: Float32Array[];
  constructor(options: { length: number; numberOfChannels: number; sampleRate: number }) {
    this.length = options.length;
    this.numberOfChannels = options.numberOfChannels;
    this.sampleRate = options.sampleRate;
    this.channels = Array.from({ length: options.numberOfChannels }, () => new Float32Array(options.length));
  }
  get duration() { return this.length / this.sampleRate; }
  copyToChannel(source: Float32Array, index: number) { this.channels[index]?.set(source); }
  getChannelData(index: number) { return this.channels[index]; }
}

function oggBytes(length = 8): ArrayBuffer {
  const bytes = new Uint8Array(length);
  bytes.set([0x4f, 0x67, 0x67, 0x53]);
  return bytes.buffer;
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("decodeOggFallback", () => {
  it("resolves null for non-Ogg data without creating a decoder", async () => {
    const { decodeOggFallback } = await import("./oggDecode");
    await expect(decodeOggFallback(new ArrayBuffer(8))).resolves.toBeNull();
    expect(constructed).not.toHaveBeenCalled();
  });

  it("decodes Ogg data into an AudioBuffer and frees the decoder", async () => {
    vi.stubGlobal("AudioBuffer", FakeAudioBuffer);
    decodeFile.mockResolvedValue({
      channelData: [new Float32Array([0.25, -0.5]), new Float32Array([0.75, -1])],
      samplesDecoded: 2,
      sampleRate: 44_100
    });
    const { decodeOggFallback } = await import("./oggDecode");
    const buffer = await decodeOggFallback(oggBytes());
    expect(buffer?.numberOfChannels).toBe(2);
    expect(buffer?.sampleRate).toBe(44_100);
    expect(Array.from(buffer?.getChannelData(0) ?? [])).toEqual([0.25, -0.5]);
    expect(Array.from(buffer?.getChannelData(1) ?? [])).toEqual([0.75, -1]);
    expect(free).toHaveBeenCalledTimes(1);
  });

  it("resolves null and frees the decoder when no samples decode", async () => {
    vi.stubGlobal("AudioBuffer", FakeAudioBuffer);
    decodeFile.mockResolvedValue({ channelData: [], samplesDecoded: 0, sampleRate: 0 });
    const { decodeOggFallback } = await import("./oggDecode");
    await expect(decodeOggFallback(oggBytes())).resolves.toBeNull();
    expect(free).toHaveBeenCalledTimes(1);
  });
});

describe("decodeAudioBytes", () => {
  it("falls back to the Vorbis decoder when native decoding rejects", async () => {
    vi.stubGlobal("AudioBuffer", FakeAudioBuffer);
    vi.stubGlobal("AudioContext", class {
      decodeAudioData = vi.fn().mockRejectedValue(new Error("unsupported"));
    });
    decodeFile.mockResolvedValue({ channelData: [new Float32Array([1])], samplesDecoded: 1, sampleRate: 48_000 });
    const { decodeAudioBytes } = await import("./audio");
    const buffer = await decodeAudioBytes(oggBytes());
    expect(buffer?.sampleRate).toBe(48_000);
    expect(free).toHaveBeenCalledTimes(1);
  });

  it("rethrows the native error for data that is not Ogg", async () => {
    const failure = new Error("decode failed");
    vi.stubGlobal("AudioContext", class {
      decodeAudioData = vi.fn().mockRejectedValue(failure);
    });
    const { decodeAudioBytes } = await import("./audio");
    await expect(decodeAudioBytes(new ArrayBuffer(8))).rejects.toBe(failure);
    expect(constructed).not.toHaveBeenCalled();
  });
});
