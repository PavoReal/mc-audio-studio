import { afterEach, describe, expect, it, vi } from "vitest";
import { clearVanillaCache, fetchVanillaBuffer } from "./vanillaAudio";
import type { CatalogVariant } from "../types";

const variant = (hash: string | null) => ({ objectHash: hash, path: "minecraft/sounds/test.ogg" }) as unknown as CatalogVariant;

describe("fetchVanillaBuffer", () => {
  afterEach(() => {
    clearVanillaCache();
    vi.unstubAllGlobals();
  });

  it("resolves null without fetching when there is no object hash", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchVanillaBuffer(variant(null))).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caches by hash so a second call reuses the same promise", async () => {
    const decoded = { duration: 1 } as AudioBuffer;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/octet-stream" }),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(4))
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("AudioContext", class {
      decodeAudioData() { return Promise.resolve(decoded); }
    });
    const first = fetchVanillaBuffer(variant("abc123"));
    const second = fetchVanillaBuffer(variant("abc123"));
    expect(second).toBe(first);
    await expect(first).resolves.toBe(decoded);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries after a failure instead of caching null", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchVanillaBuffer(variant("broken"))).resolves.toBeNull();
    await expect(fetchVanillaBuffer(variant("broken"))).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight request while a fetch is pending", async () => {
    let reject!: (reason: Error) => void;
    const fetchMock = vi.fn().mockReturnValue(new Promise((_, r) => { reject = r; }));
    vi.stubGlobal("fetch", fetchMock);
    const first = fetchVanillaBuffer(variant("pending"));
    const second = fetchVanillaBuffer(variant("pending"));
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    reject(new Error("offline"));
    await expect(first).resolves.toBeNull();
  });
});
