import { afterEach, describe, expect, it, vi } from "vitest";
import type { AudioTake, EditRecipe } from "../types";

vi.mock("./opfs", () => ({
  readBlob: vi.fn().mockResolvedValue({
    size: 8,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8))
  }),
  writeBlobAtomic: vi.fn()
}));

class FakeSource {
  buffer: AudioBuffer | null = null;
  onended: (() => void) | null = null;
  starts: number[][] = [];
  stopped = false;
  connect() { return this; }
  disconnect() { /* The fake has no graph resources. */ }
  start(...values: number[]) { this.starts.push(values); }
  stop() { this.stopped = true; this.onended?.(); }
}

class FakeAudioContext {
  currentTime = 0;
  destination = {} as AudioDestinationNode;
  sources: FakeSource[] = [];
  buffer = {
    duration: 10,
    length: 480_000,
    numberOfChannels: 1,
    sampleRate: 48_000,
    getChannelData: () => new Float32Array(1)
  } as unknown as AudioBuffer;
  decodeAudioData = vi.fn(async () => this.buffer);
  resume = vi.fn(async () => undefined);
  createGain() {
    return { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() } as unknown as GainNode;
  }
  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }
}

class FakeAudio extends EventTarget {
  currentTime = 0;
  duration = 10;
  paused = true;
  readyState = 1;
  preload = "";
  playCalls = 0;
  pauseCalls = 0;
  constructor(public src: string) { super(); }
  load() { /* Metadata is already ready. */ }
  async play() { this.playCalls += 1; this.paused = false; }
  pause() { this.pauseCalls += 1; this.paused = true; }
}

const take = {
  id: "take-1",
  opfsPath: "takes/one.wav",
  duration: 10
} as AudioTake;
const recipe: EditRecipe = { trimStart: 1, trimEnd: 8, gainDb: 0 };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("preview playback handles", () => {
  it("pauses, seeks, and recreates a custom source for the remaining range", async () => {
    const context = new FakeAudioContext();
    vi.stubGlobal("AudioContext", function AudioContextMock() { return context; });
    const { previewEditedTake } = await import("./audio");
    const handle = await previewEditedTake(take, recipe, 2);
    expect(context.sources[0]?.starts[0]).toEqual([0, 2, 6]);

    let completed = false;
    void handle.done.then(() => { completed = true; });
    context.currentTime = 1.5;
    expect(handle.getTime()).toBe(3.5);
    handle.pause();
    expect(handle.getTime()).toBe(3.5);
    await Promise.resolve();
    expect(completed).toBe(false);

    expect(handle.seek(6)).toBe(6);
    await handle.resume();
    expect(context.sources[1]?.starts[0]).toEqual([0, 6, 2]);
    context.sources[1]?.onended?.();
    await handle.done;
    expect(handle.getTime()).toBe(8);
  });

  it("restarts a custom preview at the trim start when its marker is at the end", async () => {
    const context = new FakeAudioContext();
    vi.stubGlobal("AudioContext", function AudioContextMock() { return context; });
    const { previewEditedTake } = await import("./audio");
    const handle = await previewEditedTake(take, recipe, 8);
    expect(handle.getTime()).toBe(1);
    expect(context.sources[0]?.starts[0]).toEqual([0, 1, 7]);
    handle.stop();
    await handle.done;
  });

  it("retains remote media time while paused and completes only at the end", async () => {
    const audio = new FakeAudio("/sound.ogg");
    vi.stubGlobal("Audio", function AudioMock() { return audio; });
    const { previewRemote } = await import("./audio");
    const handle = await previewRemote("/sound.ogg", 4);
    expect(audio.currentTime).toBe(4);
    expect(audio.playCalls).toBe(1);

    let completed = false;
    void handle.done.then(() => { completed = true; });
    audio.currentTime = 5;
    handle.pause();
    expect(handle.getTime()).toBe(5);
    await Promise.resolve();
    expect(completed).toBe(false);

    expect(handle.seek(7)).toBe(7);
    await handle.resume();
    expect(audio.playCalls).toBe(2);
    audio.currentTime = 10;
    audio.dispatchEvent(new Event("ended"));
    await handle.done;
    expect(handle.getTime()).toBe(10);
  });

  it("resolves a remote handle when it is explicitly stopped", async () => {
    const audio = new FakeAudio("/sound.ogg");
    vi.stubGlobal("Audio", function AudioMock() { return audio; });
    const { previewRemote } = await import("./audio");
    const handle = await previewRemote("/sound.ogg");
    audio.currentTime = 2;
    handle.stop();
    await handle.done;
    expect(handle.getTime()).toBe(2);
    expect(audio.src).toBe("");
  });
});
