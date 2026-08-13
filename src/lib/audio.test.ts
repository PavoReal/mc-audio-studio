import { describe, expect, it } from "vitest";
import { pcmToWav, waveform } from "./audio";

describe("audio utilities", () => {
  it("writes mono PCM as a valid WAV", async () => {
    const blob = pcmToWav([new Float32Array([-1, -0.5, 0, 0.5, 1])], 48_000);
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(blob);
    });
    const bytes = new Uint8Array(buffer);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe("WAVE");
    expect(new DataView(bytes.buffer).getUint32(24, true)).toBe(48_000);
    expect(blob.type).toBe("audio/wav");
  });

  it("produces bipolar, channel-specific waveform envelopes", () => {
    const samples = new Float32Array([0, .25, -.5, 1, 0, -.75, .2, 0]);
    const fake = { length: samples.length, numberOfChannels: 1, getChannelData: () => samples } as unknown as AudioBuffer;
    const [channel] = waveform(fake, 4);
    expect(channel.slice(0, 3).map((point) => [point.min, point.max])).toEqual([
      [0, .25],
      [-.5, 1],
      [-.75, 0]
    ]);
    expect(channel[3].min).toBe(0);
    expect(channel[3].max).toBeCloseTo(.2);
    expect(channel[1].rms).toBeCloseTo(Math.sqrt(.625));
    expect(channel[1].clipped).toBe(true);
    expect(channel[0].clipped).toBe(false);
  });

  it("keeps stereo channels in separate waveform lanes", () => {
    const channels = [new Float32Array([-1, .5]), new Float32Array([-.25, .75])];
    const fake = {
      length: 2,
      numberOfChannels: 2,
      getChannelData: (channel: number) => channels[channel]
    } as unknown as AudioBuffer;
    const result = waveform(fake, 1);
    expect(result).toHaveLength(2);
    expect([result[0][0].min, result[0][0].max]).toEqual([-1, .5]);
    expect([result[1][0].min, result[1][0].max]).toEqual([-.25, .75]);
  });
});
