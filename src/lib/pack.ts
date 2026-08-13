import {
  BlobReader,
  BlobWriter,
  TextReader,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipReader,
  ZipWriter
} from "@zip.js/zip.js";
import { DEFAULT_RECIPE, PACK_LIMITS, PROJECT_SCHEMA } from "../constants";
import type {
  CatalogIndexEntry,
  ImportDiagnostic,
  PackEntry,
  PackFormat,
  SoundCatalog,
  StudioProject
} from "../types";
import { slugify } from "./format";
import { readBlob, writeBlobAtomic } from "./opfs";

type ZipEntryLike = {
  filename: string;
  directory?: boolean;
  encrypted?: boolean;
  compressedSize?: number;
  uncompressedSize?: number;
  lastModDate?: Date;
  lastAccessDate?: Date;
  creationDate?: Date;
  comment?: string;
  externalFileAttributes?: number;
  internalFileAttributes?: number;
  compressionMethod?: number;
  getData: (writer: Uint8ArrayWriter | BlobWriter) => Promise<Uint8Array | Blob>;
};

export class PackImportError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "PackImportError";
  }
}

export interface InspectedPack {
  entries: PackEntry[];
  diagnostics: ImportDiagnostic[];
  wrapperPrefix: string;
  name: string;
  description: string;
  packFormat: PackFormat | null;
}

export function normalizeArchivePath(path: string): string {
  if (!path || path.includes("\0") || path.startsWith("/") || path.startsWith("\\")) {
    throw new PackImportError("unsafe-path", `Unsafe archive path: ${path || "(empty)"}`);
  }
  if (/^[a-zA-Z]:[\\/]/.test(path)) {
    throw new PackImportError("unsafe-path", `Absolute archive path: ${path}`);
  }
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "");
  const parts = normalized.split("/");
  if (parts.some((part) => part === ".." || part === "." || !part)) {
    throw new PackImportError("unsafe-path", `Unsafe archive path: ${path}`);
  }
  return parts.join("/");
}

export function stripWrapper(path: string, prefix: string): string {
  return prefix && path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

function wrapperFor(paths: string[]): string {
  if (paths.includes("pack.mcmeta")) return "";
  const candidates = paths
    .filter((path) => path.endsWith("/pack.mcmeta"))
    .map((path) => path.slice(0, -"pack.mcmeta".length));
  if (candidates.length !== 1) return "";
  const prefix = candidates[0];
  return paths.every((path) => path.startsWith(prefix)) ? prefix : "";
}

function isSymlink(entry: ZipEntryLike): boolean {
  const mode = ((entry.externalFileAttributes ?? 0) >>> 16) & 0xffff;
  return (mode & 0xf000) === 0xa000;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function probeOgg(bytes: Uint8Array): { audioDuration: number; audioSampleRate: number; audioChannels: number } | undefined {
  let channels = 0;
  let sampleRate = 0;
  let granule = 0n;
  for (let index = 0; index + 16 < bytes.length; index += 1) {
    if (bytes[index] === 1 && new TextDecoder().decode(bytes.subarray(index + 1, index + 7)) === "vorbis") {
      const view = new DataView(bytes.buffer, bytes.byteOffset + index);
      channels = view.getUint8(11);
      sampleRate = view.getUint32(12, true);
    }
    if (bytes[index] === 0x4f && bytes[index + 1] === 0x67 && bytes[index + 2] === 0x67 && bytes[index + 3] === 0x53) {
      granule = new DataView(bytes.buffer, bytes.byteOffset + index + 6, 8).getBigUint64(0, true);
    }
  }
  return channels && sampleRate
    ? { audioDuration: Number(granule) / sampleRate, audioSampleRate: sampleRate, audioChannels: channels }
    : undefined;
}

function parsePackMetadata(raw: string): { description: string; packFormat: PackFormat | null } {
  try {
    const parsed = JSON.parse(raw) as {
      pack?: { description?: unknown; pack_format?: unknown; min_format?: unknown };
    };
    const description = typeof parsed.pack?.description === "string"
      ? parsed.pack.description
      : "Imported resource pack";
    const value = parsed.pack?.min_format ?? parsed.pack?.pack_format;
    if (typeof value === "number") return { description, packFormat: value };
    if (Array.isArray(value) && value.length >= 1) {
      return { description, packFormat: [Number(value[0]), Number(value[1] ?? 0)] };
    }
    return { description, packFormat: null };
  } catch {
    return { description: "Imported resource pack", packFormat: null };
  }
}

export async function inspectResourcePack(
  archive: Blob,
  availableStorage = Number.POSITIVE_INFINITY
): Promise<InspectedPack> {
  if (archive.size > PACK_LIMITS.compressedBytes) {
    throw new PackImportError("archive-too-large", "The ZIP exceeds the 4 GiB compressed limit.");
  }
  const reader = new ZipReader(new BlobReader(archive));
  try {
    const zipEntries = (await reader.getEntries()) as unknown as ZipEntryLike[];
    if (zipEntries.length > PACK_LIMITS.entries) {
      throw new PackImportError("too-many-entries", "The ZIP contains more than 50,000 entries.");
    }
    const safePaths = zipEntries.map((entry) => normalizeArchivePath(entry.filename.replace(/\/$/, "")));
    const wrapperPrefix = wrapperFor(safePaths.filter(Boolean));
    const folded = new Set<string>();
    const diagnostics: ImportDiagnostic[] = [];
    let expanded = 0;
    let metadata = { description: "Imported resource pack", packFormat: null as PackFormat | null };
    const maxExpanded = Math.min(PACK_LIMITS.expandedBytes, availableStorage * 0.7);
    const entries: PackEntry[] = [];

    for (let index = 0; index < zipEntries.length; index += 1) {
      const source = zipEntries[index];
      const originalPath = safePaths[index];
      if (source.encrypted) {
        throw new PackImportError("encrypted", `Encrypted ZIP entries are not supported: ${source.filename}`);
      }
      if (isSymlink(source)) {
        throw new PackImportError("symlink", `Symbolic links are not allowed: ${source.filename}`);
      }
      const normalizedPath = stripWrapper(originalPath, wrapperPrefix);
      const key = normalizedPath.toLocaleLowerCase("en-US");
      if (folded.has(key)) {
        throw new PackImportError("duplicate-path", `Duplicate or case-colliding path: ${normalizedPath}`);
      }
      folded.add(key);
      const compressedSize = source.compressedSize ?? 0;
      const uncompressedSize = source.uncompressedSize ?? 0;
      expanded += uncompressedSize;
      if (expanded > maxExpanded) {
        throw new PackImportError("expanded-too-large", "The expanded ZIP exceeds the safe storage limit.");
      }
      if (
        uncompressedSize > PACK_LIMITS.compressionRatioMinBytes &&
        uncompressedSize / Math.max(1, compressedSize) > PACK_LIMITS.compressionRatio
      ) {
        throw new PackImportError("compression-ratio", `Suspicious compression ratio: ${normalizedPath}`);
      }
      const directory = Boolean(source.directory);
      let checksum = "";
      let audioMetadata: ReturnType<typeof probeOgg>;
      if (!directory) {
        const bytes = await source.getData(new Uint8ArrayWriter()) as Uint8Array;
        checksum = await sha256(bytes);
        if (/^assets\/[^/]+\/sounds\/.+\.ogg$/i.test(normalizedPath)) audioMetadata = probeOgg(bytes);
        if (normalizedPath === "pack.mcmeta") {
          metadata = parsePackMetadata(new TextDecoder().decode(bytes));
        }
      }
      entries.push({
        normalizedPath,
        originalPath,
        checksum,
        compressedSize,
        uncompressedSize,
        lastModified: source.lastModDate?.toISOString(),
        lastAccessed: source.lastAccessDate?.toISOString(),
        createdAt: source.creationDate?.toISOString(),
        comment: source.comment,
        compressionMethod: source.compressionMethod,
        internalFileAttributes: source.internalFileAttributes,
        externalFileAttributes: source.externalFileAttributes,
        directory,
        editableAudio: /^assets\/[^/]+\/sounds\/.+\.ogg$/i.test(normalizedPath),
        ...audioMetadata
      });
    }
    if (!entries.some((entry) => entry.normalizedPath === "pack.mcmeta")) {
      diagnostics.push({
        level: "warning",
        code: "missing-pack-metadata",
        message: "pack.mcmeta is missing; Sound Studio will create it on export."
      });
    }
    if (wrapperPrefix) {
      diagnostics.push({
        level: "warning",
        code: "wrapper-repaired",
        message: `The accidental “${wrapperPrefix.slice(0, -1)}” wrapper folder will be removed on export.`
      });
    }
    return {
      entries,
      diagnostics,
      wrapperPrefix,
      name: archive instanceof File ? archive.name.replace(/\.zip$/i, "") : "Imported Pack",
      description: metadata.description,
      packFormat: metadata.packFormat
    };
  } finally {
    await reader.close();
  }
}

export function newProject(
  name: string,
  catalog: Pick<SoundCatalog, "version" | "packFormat">
): StudioProject {
  const now = new Date().toISOString();
  return {
    schemaVersion: PROJECT_SCHEMA,
    id: crypto.randomUUID(),
    name: name.trim() || "Untitled Sound Pack",
    slug: slugify(name),
    description: "Custom sounds made with Minecraft Sound Studio",
    minecraftVersion: catalog.version,
    packFormat: catalog.packFormat,
    createdAt: now,
    updatedAt: now,
    baseArchivePath: null,
    baseArchiveName: null,
    packEntries: [],
    importDiagnostics: [],
    replacements: {},
    backdrop: "day"
  };
}

export async function projectFromArchive(
  archive: File,
  catalog: Pick<SoundCatalog, "version" | "packFormat">,
  availableStorage: number
): Promise<StudioProject> {
  const inspected = await inspectResourcePack(archive, availableStorage);
  const project = newProject(inspected.name, catalog);
  project.description = inspected.description;
  project.packFormat = inspected.packFormat ?? catalog.packFormat;
  project.packEntries = inspected.entries;
  project.importDiagnostics = inspected.diagnostics;
  project.baseArchiveName = archive.name;
  project.baseArchivePath = `projects/${project.id}/base.zip`;
  await writeBlobAtomic(project.baseArchivePath, archive);
  return project;
}

export function archivePathForTarget(targetPath: string): string {
  return `assets/${targetPath.replace(/^assets\//, "")}`;
}

export function importedTargetPath(entryPath: string): string | null {
  const match = /^assets\/([^/]+\/sounds\/.+\.ogg)$/i.exec(entryPath);
  return match ? match[1] : null;
}

export interface ExportOptions {
  renderReplacement: (targetPath: string) => Promise<{ blob: Blob; peakDb: number }>;
  onProgress?: (value: number, message: string) => void;
  /** Test and recovery seam; production exports read the immutable OPFS base archive. */
  readBaseArchive?: (path: string) => Promise<Blob>;
}

export async function buildResourcePack(
  project: StudioProject,
  options: ExportOptions
): Promise<{ blob: Blob; warnings: string[]; rendered: number }> {
  const output = new BlobWriter("application/zip");
  const result = await writeResourcePack<Blob>(project, options, output);
  return { blob: result.output, warnings: result.warnings, rendered: result.rendered };
}

export async function streamResourcePack(
  project: StudioProject,
  options: ExportOptions,
  output: WritableStream<Uint8Array>
): Promise<{ warnings: string[]; rendered: number }> {
  const result = await writeResourcePack<void>(project, options, output);
  return { warnings: result.warnings, rendered: result.rendered };
}

async function writeResourcePack<Output>(
  project: StudioProject,
  options: ExportOptions,
  output: BlobWriter | WritableStream<Uint8Array>
): Promise<{ output: Output; warnings: string[]; rendered: number }> {
  const writer = new ZipWriter<Output>(output);
  const replacementEntries = new Map(
    Object.values(project.replacements)
      .filter((replacement) => replacement.activeTakeId)
      .map((replacement) => [archivePathForTarget(replacement.targetPath), replacement])
  );
  const warnings: string[] = [];
  let rendered = 0;
  let baseReader: ZipReader<Blob> | null = null;
  try {
    if (project.baseArchivePath) {
      const readBaseArchive = options.readBaseArchive ?? readBlob;
      baseReader = new ZipReader(new BlobReader(await readBaseArchive(project.baseArchivePath)));
      const originals = (await baseReader.getEntries()) as unknown as ZipEntryLike[];
      const originalByPath = new Map(originals.map((entry) => [normalizeArchivePath(entry.filename.replace(/\/$/, "")), entry]));
      for (let index = 0; index < project.packEntries.length; index += 1) {
        const metadata = project.packEntries[index];
        if (metadata.directory) continue;
        const replacement = replacementEntries.get(metadata.normalizedPath);
        if (replacement) {
          const result = await options.renderReplacement(replacement.targetPath);
          await writer.add(metadata.normalizedPath, new BlobReader(result.blob), {
            lastModDate: metadata.lastModified ? new Date(metadata.lastModified) : new Date(0),
            lastAccessDate: metadata.lastAccessed ? new Date(metadata.lastAccessed) : undefined,
            creationDate: metadata.createdAt ? new Date(metadata.createdAt) : undefined,
            comment: metadata.comment,
            compressionMethod: [0, 8].includes(metadata.compressionMethod ?? 8) ? metadata.compressionMethod : undefined,
            internalFileAttributes: metadata.internalFileAttributes,
            externalFileAttributes: metadata.externalFileAttributes
          });
          if (result.peakDb >= -0.1) warnings.push(`${replacement.targetPath} reaches ${result.peakDb.toFixed(1)} dBFS.`);
          replacementEntries.delete(metadata.normalizedPath);
          rendered += 1;
        } else {
          const original = originalByPath.get(metadata.originalPath);
          if (!original) throw new Error(`Missing original ZIP entry: ${metadata.originalPath}`);
          const bytes = await original.getData(new Uint8ArrayWriter()) as Uint8Array;
          await writer.add(metadata.normalizedPath, new Uint8ArrayReader(bytes), {
            lastModDate: metadata.lastModified ? new Date(metadata.lastModified) : new Date(0),
            lastAccessDate: metadata.lastAccessed ? new Date(metadata.lastAccessed) : undefined,
            creationDate: metadata.createdAt ? new Date(metadata.createdAt) : undefined,
            comment: metadata.comment,
            compressionMethod: [0, 8].includes(metadata.compressionMethod ?? 8) ? metadata.compressionMethod : undefined,
            internalFileAttributes: metadata.internalFileAttributes,
            externalFileAttributes: metadata.externalFileAttributes
          });
        }
        options.onProgress?.((index + 1) / Math.max(1, project.packEntries.length), metadata.normalizedPath);
      }
    }

    if (!project.packEntries.some((entry) => entry.normalizedPath === "pack.mcmeta")) {
      const metadata = JSON.stringify({
        pack: {
          description: project.description,
          min_format: project.packFormat,
          max_format: project.packFormat
        }
      }, null, 2);
      await writer.add("pack.mcmeta", new TextReader(`${metadata}\n`));
    }
    for (const [path, replacement] of replacementEntries) {
      const result = await options.renderReplacement(replacement.targetPath);
      await writer.add(path, new BlobReader(result.blob), { lastModDate: new Date(0) });
      if (result.peakDb >= -0.1) warnings.push(`${replacement.targetPath} reaches ${result.peakDb.toFixed(1)} dBFS.`);
      rendered += 1;
    }
    return { output: await writer.close(), warnings, rendered };
  } catch (error) {
    await writer.close().catch(() => undefined);
    throw error;
  } finally {
    await baseReader?.close();
  }
}

export function replacementFor(targetPath: string) {
  return {
    targetPath,
    takes: [],
    activeTakeId: null,
    edit: { ...DEFAULT_RECIPE },
    status: "draft" as const
  };
}

export function preferredCatalog(index: CatalogIndexEntry[]): CatalogIndexEntry | undefined {
  return [...index].sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))[0];
}
