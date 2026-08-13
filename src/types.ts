export type PackFormat = number | [number, number];

export interface PackEntry {
  normalizedPath: string;
  originalPath: string;
  checksum: string;
  compressedSize: number;
  uncompressedSize: number;
  lastModified?: string;
  lastAccessed?: string;
  createdAt?: string;
  comment?: string;
  compressionMethod?: number;
  internalFileAttributes?: number;
  externalFileAttributes?: number;
  directory: boolean;
  editableAudio: boolean;
  audioDuration?: number;
  audioSampleRate?: number;
  audioChannels?: number;
}

export interface ImportDiagnostic {
  level: "info" | "warning";
  code: string;
  message: string;
}

export interface EditRecipe {
  trimStart: number;
  trimEnd: number | null;
  gainDb: number;
}

export interface AudioTake {
  id: string;
  label: string;
  opfsPath: string;
  mimeType: string;
  size: number;
  duration: number;
  sampleRate: number;
  channels: number;
  createdAt: string;
  origin: "recording" | "import" | "copy";
}

export interface SoundReplacement {
  targetPath: string;
  takes: AudioTake[];
  activeTakeId: string | null;
  edit: EditRecipe;
  status: "draft" | "ready";
}

export interface StudioProject {
  schemaVersion: 1;
  id: string;
  name: string;
  slug: string;
  description: string;
  minecraftVersion: string;
  packFormat: PackFormat;
  createdAt: string;
  updatedAt: string;
  baseArchivePath: string | null;
  baseArchiveName: string | null;
  packEntries: PackEntry[];
  importDiagnostics: ImportDiagnostic[];
  replacements: Record<string, SoundReplacement>;
  backdrop: "day";
}

export interface CatalogSoundMetadata {
  name: string;
  type?: "file" | "event";
  volume?: number;
  pitch?: number;
  weight?: number;
  stream?: boolean;
  preload?: boolean;
  attenuationDistance?: number;
}

export interface CatalogVariant {
  path: string;
  objectHash: string;
  events: string[];
  directEvents: string[];
  metadata: CatalogSoundMetadata[];
  duration: number;
  sampleRate: number;
  channels: number;
}

export interface CatalogEvent {
  id: string;
  label: string;
  subtitleKey?: string;
  variants: string[];
}

export interface SoundCatalog {
  schemaVersion: 1;
  version: string;
  packFormat: PackFormat;
  assetIndex: string;
  assetIndexHash: string;
  clientHash: string;
  soundsHash: string;
  generatedAt: string;
  events: Record<string, CatalogEvent>;
  variants: Record<string, CatalogVariant>;
}

export interface CatalogIndexEntry {
  version: string;
  type: "release";
  packFormat: PackFormat;
  path: string;
  sha256: string;
  sounds: number;
  events: number;
}

export interface CatalogIndex {
  schemaVersion: 1;
  generatedAt: string;
  catalogs: CatalogIndexEntry[];
}

export interface StorageEstimate {
  usage: number;
  quota: number;
  persisted: boolean;
}

export type WorkerRequest =
  | { id: string; type: "waveform"; pcm: Float32Array; bins: number }
  | { id: string; type: "render"; takePath: string; recipe: EditRecipe; sampleRate: number; channels: number }
  | { id: string; type: "export"; projectId: string };

export type WorkerResponse =
  | { id: string; type: "progress"; value: number; message: string }
  | { id: string; type: "warning"; code: string; message: string }
  | { id: string; type: "result"; payload: unknown }
  | { id: string; type: "error"; code: string; message: string };
