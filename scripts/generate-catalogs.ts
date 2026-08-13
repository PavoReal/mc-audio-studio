import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { BlobReader, TextWriter, ZipReader } from "@zip.js/zip.js";
import type { CatalogEvent, CatalogIndex, CatalogIndexEntry, CatalogSoundMetadata, CatalogVariant, PackFormat, SoundCatalog } from "../src/types";

const VERSION_MANIFEST = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const ASSET_ROOT = "https://resources.download.minecraft.net";
const RELEASE_CUTOFF = "2024-06-13T00:00:00+00:00"; // Java 1.21 release day.
const outputDirectory = resolve("public/catalogs");
const argumentsSet = new Set(process.argv.slice(2));
const versionFlagIndex = process.argv.indexOf("--version");
const versionArgument = versionFlagIndex >= 0 ? process.argv[versionFlagIndex + 1] : undefined;
const quick = argumentsSet.has("--quick");
const oggProbeCache = new Map<string, Promise<{ channels: number; sampleRate: number; duration: number }>>();

interface Manifest {
  versions: Array<{ id: string; type: string; url: string; sha1: string; releaseTime: string }>;
}

interface VersionMetadata {
  id: string;
  assetIndex: { id: string; sha1: string; url: string };
  downloads: { client: { url: string; sha1: string } };
}

interface AssetIndex {
  objects: Record<string, { hash: string; size: number }>;
}

async function fetchBytes(url: string, expectedSha1?: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} while fetching ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (expectedSha1) {
    const actual = createHash("sha1").update(bytes).digest("hex");
    if (actual !== expectedSha1) throw new Error(`SHA-1 mismatch for ${url}`);
  }
  return bytes;
}

async function fetchJson<T>(url: string, expectedSha1?: string): Promise<T> {
  return JSON.parse(new TextDecoder().decode(await fetchBytes(url, expectedSha1))) as T;
}

async function jarJson(client: Uint8Array, filename: string): Promise<Record<string, unknown>> {
  const reader = new ZipReader(new BlobReader(new Blob([client])));
  try {
    const entry = (await reader.getEntries()).find((candidate) => candidate.filename === filename);
    if (!entry || entry.directory) throw new Error(`Client JAR is missing ${filename}`);
    return JSON.parse(await entry.getData(new TextWriter())) as Record<string, unknown>;
  } finally {
    await reader.close();
  }
}

function objectUrl(hash: string): string {
  return `${ASSET_ROOT}/${hash.slice(0, 2)}/${hash}`;
}

function parsePackFormat(versionData: Record<string, unknown>): PackFormat {
  const pack = versionData.pack_version as Record<string, unknown> | undefined;
  const major = Number(pack?.resource_major ?? pack?.resource ?? 0);
  const minor = Number(pack?.resource_minor ?? 0);
  return minor ? [major, minor] : [major, 0];
}

function parseIdentificationHeader(bytes: Uint8Array): { channels: number; sampleRate: number } | null {
  for (let index = 0; index + 16 < bytes.length; index += 1) {
    if (bytes[index] === 1 && new TextDecoder().decode(bytes.slice(index + 1, index + 7)) === "vorbis") {
      const view = new DataView(bytes.buffer, bytes.byteOffset + index);
      return { channels: view.getUint8(11), sampleRate: view.getUint32(12, true) };
    }
  }
  return null;
}

function lastGranule(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let index = 0; index + 14 < bytes.length; index += 1) {
    if (bytes[index] === 0x4f && bytes[index + 1] === 0x67 && bytes[index + 2] === 0x67 && bytes[index + 3] === 0x53) {
      result = new DataView(bytes.buffer, bytes.byteOffset + index + 6, 8).getBigUint64(0, true);
    }
  }
  return result;
}

async function probeOgg(hash: string, size: number): Promise<{ channels: number; sampleRate: number; duration: number }> {
  const url = objectUrl(hash);
  const headEnd = Math.min(size - 1, 65_535);
  const tailStart = Math.max(0, size - 65_536);
  const [headResponse, tailResponse] = await Promise.all([
    fetch(url, { headers: { Range: `bytes=0-${headEnd}` } }),
    fetch(url, { headers: { Range: `bytes=${tailStart}-${size - 1}` } })
  ]);
  if (!headResponse.ok || !tailResponse.ok) throw new Error(`Could not probe ${hash}`);
  const head = new Uint8Array(await headResponse.arrayBuffer());
  const tail = new Uint8Array(await tailResponse.arrayBuffer());
  const identification = parseIdentificationHeader(head) ?? { channels: 1, sampleRate: 48_000 };
  const granule = lastGranule(tail);
  return { ...identification, duration: granule > 0n ? Number(granule) / identification.sampleRate : 0 };
}

function probeOggCached(hash: string, size: number) {
  let pending = oggProbeCache.get(hash);
  if (!pending) {
    pending = probeOgg(hash, size);
    oggProbeCache.set(hash, pending);
  }
  return pending;
}

function buildMappings(
  sounds: Record<string, { subtitle?: string; sounds?: Array<string | CatalogSoundMetadata> }>,
  assets: AssetIndex["objects"],
  language: Record<string, string>
): { events: Record<string, CatalogEvent>; variants: Record<string, CatalogVariant> } {
  const directUses = new Map<string, Set<string>>();
  const metadata = new Map<string, CatalogSoundMetadata[]>();
  const references = new Map<string, string[]>();
  const directByEvent = new Map<string, string[]>();

  for (const [eventId, spec] of Object.entries(sounds)) {
    for (const raw of spec.sounds ?? []) {
      const entry = typeof raw === "string" ? { name: raw } : { ...raw };
      if (!entry.name) continue;
      if (entry.type === "event") {
        references.set(eventId, [...(references.get(eventId) ?? []), entry.name]);
      } else {
        const path = `minecraft/sounds/${entry.name}.ogg`;
        directUses.set(path, new Set([...(directUses.get(path) ?? []), eventId]));
        directByEvent.set(eventId, [...(directByEvent.get(eventId) ?? []), path]);
        metadata.set(path, [...(metadata.get(path) ?? []), entry]);
      }
    }
  }

  const cache = new Map<string, Set<string>>();
  function resolveEvent(eventId: string, stack = new Set<string>()): Set<string> {
    if (cache.has(eventId)) return cache.get(eventId)!;
    if (stack.has(eventId)) return new Set();
    const active = new Set(stack).add(eventId);
    const result = new Set(directByEvent.get(eventId) ?? []);
    for (const reference of references.get(eventId) ?? []) {
      for (const path of resolveEvent(reference, active)) result.add(path);
    }
    cache.set(eventId, result);
    return result;
  }

  const uses = new Map<string, Set<string>>();
  const events: Record<string, CatalogEvent> = {};
  for (const [eventId, spec] of Object.entries(sounds)) {
    const variants = [...resolveEvent(eventId)].sort();
    for (const path of variants) uses.set(path, new Set([...(uses.get(path) ?? []), eventId]));
    events[eventId] = {
      id: eventId,
      label: spec.subtitle && language[spec.subtitle] ? language[spec.subtitle] : eventId.replace(/[._]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
      subtitleKey: spec.subtitle,
      variants
    };
  }

  const variants: Record<string, CatalogVariant> = {};
  for (const [path, asset] of Object.entries(assets)) {
    if (!path.startsWith("minecraft/sounds/") || !path.endsWith(".ogg")) continue;
    variants[path] = {
      path,
      objectHash: asset.hash,
      events: [...(uses.get(path) ?? [])].sort(),
      directEvents: [...(directUses.get(path) ?? [])].sort(),
      metadata: metadata.get(path) ?? [],
      duration: 0,
      sampleRate: 48_000,
      channels: 1
    };
  }
  return { events, variants };
}

async function mapLimit<T>(items: T[], limit: number, work: (item: T, index: number) => Promise<void>) {
  let cursor = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await work(items[index], index);
    }
  }));
}

async function generate(version: Manifest["versions"][number]): Promise<CatalogIndexEntry> {
  process.stdout.write(`Generating Java ${version.id}…\n`);
  const metadata = await fetchJson<VersionMetadata>(version.url, version.sha1);
  const [assetIndex, client] = await Promise.all([
    fetchJson<AssetIndex>(metadata.assetIndex.url, metadata.assetIndex.sha1),
    fetchBytes(metadata.downloads.client.url, metadata.downloads.client.sha1)
  ]);
  const soundsAsset = assetIndex.objects["minecraft/sounds.json"];
  if (!soundsAsset) throw new Error(`${version.id} has no sounds.json asset`);
  const [sounds, versionData, language] = await Promise.all([
    fetchJson<Record<string, { subtitle?: string; sounds?: Array<string | CatalogSoundMetadata> }>>(objectUrl(soundsAsset.hash), soundsAsset.hash),
    jarJson(client, "version.json"),
    jarJson(client, "assets/minecraft/lang/en_us.json") as Promise<Record<string, string>>
  ]);
  const mappings = buildMappings(sounds, assetIndex.objects, language);
  const variantList = Object.values(mappings.variants);
  if (!quick) {
    await mapLimit(variantList, 18, async (variant, index) => {
      const asset = assetIndex.objects[variant.path];
      Object.assign(variant, await probeOggCached(asset.hash, asset.size));
      if ((index + 1) % 250 === 0) process.stdout.write(`  probed ${index + 1}/${variantList.length}\n`);
    });
  }
  const catalog: SoundCatalog = {
    schemaVersion: 1,
    version: version.id,
    packFormat: parsePackFormat(versionData),
    assetIndex: metadata.assetIndex.id,
    assetIndexHash: metadata.assetIndex.sha1,
    soundsHash: soundsAsset.hash,
    clientHash: metadata.downloads.client.sha1,
    generatedAt: version.releaseTime,
    events: mappings.events,
    variants: mappings.variants
  };
  const json = `${JSON.stringify(catalog)}\n`;
  const sha256 = createHash("sha256").update(json).digest("hex");
  const filename = `${version.id}.${sha256.slice(0, 16)}.json`;
  await writeFile(resolve(outputDirectory, filename), json);
  return {
    version: version.id,
    type: "release",
    packFormat: catalog.packFormat,
    path: `/catalogs/${filename}`,
    sha256,
    sounds: variantList.length,
    events: Object.keys(catalog.events).length
  };
}

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  const manifest = await fetchJson<Manifest>(VERSION_MANIFEST);
  const releases = manifest.versions.filter((version) =>
    version.type === "release" && version.releaseTime >= RELEASE_CUTOFF && (!versionArgument || version.id === versionArgument)
  );
  if (!releases.length) throw new Error(`No matching stable releases${versionArgument ? ` for ${versionArgument}` : ""}.`);
  const entries: CatalogIndexEntry[] = [];
  for (const version of releases) entries.push(await generate(version));

  let existing: CatalogIndex = { schemaVersion: 1, generatedAt: new Date().toISOString(), catalogs: [] };
  try { existing = JSON.parse(await readFile(resolve(outputDirectory, "index.json"), "utf8")) as CatalogIndex; } catch { /* first run */ }
  const updated = new Map(existing.catalogs.map((entry) => [entry.version, entry]));
  for (const entry of entries) updated.set(entry.version, entry);
  const index: CatalogIndex = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    catalogs: [...updated.values()].sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))
  };
  await writeFile(resolve(outputDirectory, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
  process.stdout.write(`Wrote ${entries.length} catalog(s) to ${outputDirectory}.\n`);
}

await main();
