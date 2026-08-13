// @vitest-environment node
import { webcrypto } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { BlobReader, BlobWriter, TextReader, TextWriter, Uint8ArrayWriter, ZipReader, ZipWriter } from "@zip.js/zip.js";
import { buildResourcePack, inspectResourcePack, newProject, normalizeArchivePath } from "./pack";

beforeAll(() => {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
});

async function archive(entries: Array<[string, string]>): Promise<Blob> {
  const output = new BlobWriter("application/zip");
  const writer = new ZipWriter(output);
  for (const [path, contents] of entries) await writer.add(path, new TextReader(contents), { lastModDate: new Date(0) });
  return writer.close();
}

async function contentsByPath(blob: Blob): Promise<Map<string, Uint8Array>> {
  const reader = new ZipReader(new BlobReader(blob));
  try {
    const contents = new Map<string, Uint8Array>();
    for (const entry of await reader.getEntries()) {
      if (!entry.directory) contents.set(entry.filename, await entry.getData(new Uint8ArrayWriter()));
    }
    return contents;
  } finally {
    await reader.close();
  }
}

async function digest(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("resource pack safety", () => {
  it.each(["../escape", "/absolute", "C:/absolute", "assets//double"])("rejects unsafe path %s", (path) => {
    expect(() => normalizeArchivePath(path)).toThrow(/path/i);
  });

  it("repairs a single wrapper and preserves custom namespace entries", async () => {
    const blob = await archive([
      ["My Pack/pack.mcmeta", JSON.stringify({ pack: { description: "Wrapped", pack_format: 34 } })],
      ["My Pack/assets/acme/sounds.json", "{}"],
      ["My Pack/assets/acme/sounds/bell.ogg", "custom-audio"],
      ["My Pack/assets/minecraft/textures/block/stone.png", "texture"]
    ]);
    const result = await inspectResourcePack(blob);
    expect(result.wrapperPrefix).toBe("My Pack/");
    expect(result.description).toBe("Wrapped");
    expect(result.entries.map((entry) => entry.normalizedPath)).toContain("assets/acme/sounds/bell.ogg");
    expect(result.diagnostics[0].code).toBe("wrapper-repaired");
  });

  it("rejects case-insensitive path collisions", async () => {
    const blob = await archive([["pack.mcmeta", "{}"], ["A.txt", "one"], ["a.txt", "two"]]);
    await expect(inspectResourcePack(blob)).rejects.toThrow(/colliding/i);
  });

  it("builds a valid blank resource pack without sounds.json", async () => {
    const project = newProject("Golden Sounds", { version: "26.2", packFormat: [88, 0] });
    const result = await buildResourcePack(project, { renderReplacement: async () => { throw new Error("not called"); } });
    const reader = new ZipReader(new BlobReader(result.blob));
    const entries = await reader.getEntries();
    expect(entries.map((entry) => entry.filename)).toEqual(["pack.mcmeta"]);
    const metadata = entries[0];
    if (metadata.directory) throw new Error("pack.mcmeta should be a file");
    expect(await metadata.getData(new TextWriter())).toContain('"min_format"');
    await reader.close();
  });

  it("preserves unchanged imported files and custom sounds.json byte-for-byte", async () => {
    const source = await archive([
      ["Peak Pack/pack.mcmeta", JSON.stringify({ pack: { description: "Peak Pack", pack_format: 34 } })],
      ["Peak Pack/assets/acme/sounds.json", '{"crystal.chime":{"sounds":["acme:chime"]}}\n'],
      ["Peak Pack/assets/acme/sounds/chime.ogg", "original-custom-audio"],
      ["Peak Pack/assets/minecraft/textures/block/stone.png", "original-texture"]
    ]);
    const inspected = await inspectResourcePack(source);
    const project = newProject("Peak Pack", { version: "26.2", packFormat: [88, 0] });
    project.baseArchivePath = "projects/test/base.zip";
    project.baseArchiveName = "Peak Pack.zip";
    project.packEntries = inspected.entries;
    project.importDiagnostics = inspected.diagnostics;

    const exported = await buildResourcePack(project, {
      readBaseArchive: async () => source,
      renderReplacement: async () => { throw new Error("not called"); }
    });
    const before = await contentsByPath(source);
    const after = await contentsByPath(exported.blob);

    for (const [wrappedPath, bytes] of before) {
      const normalizedPath = wrappedPath.replace("Peak Pack/", "");
      expect(after.has(normalizedPath)).toBe(true);
      expect(await digest(after.get(normalizedPath)!)).toBe(await digest(bytes));
    }
    expect(after.has("assets/acme/sounds.json")).toBe(true);
    expect([...after.keys()].some((path) => path.startsWith("Peak Pack/"))).toBe(false);
  });

  it("rejects bomb-like compression ratios", async () => {
    const source = await archive([
      ["pack.mcmeta", "{}"],
      ["assets/acme/sounds/bomb.ogg", "0".repeat(11 * 1024 * 1024)]
    ]);
    await expect(inspectResourcePack(source)).rejects.toMatchObject({ code: "compression-ratio" });
  });
});
