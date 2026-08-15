import { afterEach, describe, expect, it, vi } from "vitest";

class FakeContext {
  static created = 0;
  state = "suspended";
  resume = vi.fn(async () => { this.state = "running"; });
  close = vi.fn(async () => { this.state = "closed"; });
  constructor() { FakeContext.created += 1; }
}

afterEach(() => {
  FakeContext.created = 0;
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("shared audio context lifecycle", () => {
  it("resumes a context that is not running and skips one that is", async () => {
    vi.stubGlobal("AudioContext", FakeContext);
    const { audioContext, unlockAudio } = await import("./audio");
    unlockAudio();
    const context = audioContext() as unknown as FakeContext;
    expect(context.resume).toHaveBeenCalledTimes(1);
    unlockAudio();
    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(FakeContext.created).toBe(1);
  });

  it("closes the stale context and creates a fresh one after a reset", async () => {
    vi.stubGlobal("AudioContext", FakeContext);
    const { audioContext, resetAudioContext } = await import("./audio");
    const first = audioContext() as unknown as FakeContext;
    resetAudioContext();
    expect(first.close).toHaveBeenCalledTimes(1);
    const second = audioContext() as unknown as FakeContext;
    expect(second).not.toBe(first);
    expect(FakeContext.created).toBe(2);
  });

  it("does nothing on reset when no context exists yet", async () => {
    vi.stubGlobal("AudioContext", FakeContext);
    const { resetAudioContext } = await import("./audio");
    resetAudioContext();
    expect(FakeContext.created).toBe(0);
  });
});
