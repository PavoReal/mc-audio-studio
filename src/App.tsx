import { useEffect, useMemo, useState } from "react";
import { Landing } from "./components/Landing";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { Workspace } from "./components/Workspace";
import { DEFAULT_RECIPE } from "./constants";
import { encodeVorbis, renderTake, saveTake, stopPreview } from "./lib/audio";
import { loadCatalog, loadCatalogIndex } from "./lib/catalog";
import { formatBytes } from "./lib/format";
import { removePrivateFile, storageEstimate } from "./lib/opfs";
import {
  buildResourcePack,
  type ExportOptions,
  importedTargetPath,
  newProject,
  preferredCatalog,
  projectFromArchive,
  replacementFor,
  streamResourcePack
} from "./lib/pack";
import { listProjects, saveProject } from "./lib/storage";
import type {
  AudioTake,
  CatalogIndex,
  CatalogVariant,
  EditRecipe,
  SoundCatalog,
  SoundReplacement,
  StorageEstimate,
  StudioProject
} from "./types";

const EMPTY_STORAGE: StorageEstimate = { usage: 0, quota: 0, persisted: false };

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function mergeImportedSounds(catalog: SoundCatalog, project: StudioProject): SoundCatalog {
  const extras: Record<string, CatalogVariant> = {};
  for (const entry of project.packEntries) {
    if (!entry.editableAudio) continue;
    const target = importedTargetPath(entry.normalizedPath);
    if (target && !catalog.variants[target]) {
      extras[target] = {
        path: target,
        objectHash: "",
        events: [],
        directEvents: [],
        metadata: [],
        duration: entry.audioDuration ?? 0,
        sampleRate: entry.audioSampleRate ?? 48_000,
        channels: entry.audioChannels ?? 1
      };
    }
  }
  return Object.keys(extras).length ? { ...catalog, variants: { ...catalog.variants, ...extras } } : catalog;
}

export default function App() {
  const [index, setIndex] = useState<CatalogIndex | null>(null);
  const [catalog, setCatalog] = useState<SoundCatalog | null>(null);
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [project, setProject] = useState<StudioProject | null>(null);
  const [selectedVersion, setSelectedVersion] = useState("");
  const [selectedPath, setSelectedPath] = useState("");
  const [storage, setStorage] = useState<StorageEstimate>(EMPTY_STORAGE);
  const [busy, setBusy] = useState("Loading local studio…");
  const [error, setError] = useState("");
  const [exportProgress, setExportProgress] = useState(0);

  useEffect(() => {
    void Promise.all([loadCatalogIndex(), listProjects(), storageEstimate(true)])
      .then(async ([nextIndex, nextProjects, estimate]) => {
        setIndex(nextIndex);
        setProjects(nextProjects);
        setStorage(estimate);
        const preferred = preferredCatalog(nextIndex.catalogs);
        if (!preferred) throw new Error("No supported Java release catalogs are installed.");
        setSelectedVersion(preferred.version);
        setCatalog(await loadCatalog(preferred));
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setBusy(""));
  }, []);

  useEffect(() => {
    if (!project) return;
    const timer = window.setTimeout(() => {
      void saveProject(project).then(() => {
        setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [project]);

  const effectiveCatalog = useMemo(() => project && catalog ? mergeImportedSounds(catalog, project) : catalog, [catalog, project]);

  async function chooseVersion(version: string) {
    const entry = index?.catalogs.find((item) => item.version === version);
    if (!entry) return;
    setSelectedVersion(version);
    setBusy(`Loading Java ${version} catalog…`);
    setError("");
    try { setCatalog(await loadCatalog(entry)); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(""); }
  }

  function firstPath(nextCatalog: SoundCatalog): string {
    return Object.keys(nextCatalog.variants)[0] ?? "";
  }

  async function createProject() {
    if (!catalog) return;
    const next = newProject("My Sound Pack", catalog, "day");
    await saveProject(next);
    setProject(next);
    setSelectedPath(firstPath(catalog));
  }

  async function importProject(file: File) {
    if (!catalog) return;
    setBusy(`Inspecting ${file.name}…`);
    setError("");
    try {
      const available = Math.max(0, storage.quota - storage.usage);
      const next = await projectFromArchive(file, catalog, available || Number.POSITIVE_INFINITY);
      await saveProject(next);
      setProject(next);
      const merged = mergeImportedSounds(catalog, next);
      setSelectedPath(firstPath(merged));
      setStorage(await storageEstimate());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setBusy(""); }
  }

  async function openProject(next: StudioProject) {
    const entry = index?.catalogs.find((item) => item.version === next.minecraftVersion);
    if (!entry) {
      setError(`The Java ${next.minecraftVersion} catalog is not installed.`);
      return;
    }
    setBusy(`Opening ${next.name}…`);
    try {
      const nextCatalog = await loadCatalog(entry);
      setCatalog(nextCatalog);
      setSelectedVersion(entry.version);
      setProject(next);
      setSelectedPath(firstPath(mergeImportedSounds(nextCatalog, next)));
    } finally { setBusy(""); }
  }

  function updateProject(mutator: (draft: StudioProject) => StudioProject) {
    setProject((current) => current ? { ...mutator(current), updatedAt: new Date().toISOString() } : current);
  }

  function replacementWithTake(current: StudioProject, targetPath: string, take: AudioTake): StudioProject {
    const existing = current.replacements[targetPath] ?? replacementFor(targetPath);
    const replacement: SoundReplacement = {
      ...existing,
      takes: [...existing.takes, take],
      activeTakeId: take.id,
      edit: { ...DEFAULT_RECIPE, trimEnd: take.duration },
      status: "draft"
    };
    return { ...current, replacements: { ...current.replacements, [targetPath]: replacement } };
  }

  async function addAudio(blob: Blob, label: string, origin: AudioTake["origin"]) {
    if (!project || !selectedPath) return;
    setBusy(origin === "recording" ? "Saving recording…" : "Decoding audio…");
    setError("");
    try {
      const take = await saveTake(project.id, selectedPath, blob, label, origin);
      updateProject((current) => replacementWithTake(current, selectedPath, take));
      setStorage(await storageEstimate());
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(""); }
  }

  function changeRecipe(recipe: EditRecipe) {
    if (!project) return;
    updateProject((current) => {
      const replacement = current.replacements[selectedPath];
      if (!replacement) return current;
      return { ...current, replacements: { ...current.replacements, [selectedPath]: { ...replacement, edit: recipe } } };
    });
  }

  function applyToEvent() {
    if (!project || !effectiveCatalog) return;
    const variant = effectiveCatalog.variants[selectedPath];
    const sourceReplacement = project.replacements[selectedPath];
    const active = sourceReplacement?.takes.find((take) => take.id === sourceReplacement.activeTakeId);
    const event = variant?.events[0];
    if (!active || !event) return;
    updateProject((current) => {
      const replacements = { ...current.replacements };
      for (const path of effectiveCatalog.events[event]?.variants ?? [selectedPath]) {
        if (path === selectedPath) continue;
        const copied = { ...active, id: crypto.randomUUID(), label: `Copy of ${active.label}`, origin: "copy" as const };
        const existing = replacements[path] ?? replacementFor(path);
        replacements[path] = { ...existing, takes: [...existing.takes, copied], activeTakeId: copied.id, edit: { ...sourceReplacement.edit } };
      }
      return { ...current, replacements };
    });
  }

  function activateTake(take: AudioTake) {
    updateProject((current) => {
      const replacement = current.replacements[selectedPath];
      return replacement ? { ...current, replacements: { ...current.replacements, [selectedPath]: { ...replacement, activeTakeId: take.id } } } : current;
    });
  }

  async function deleteTake(take: AudioTake) {
    if (!project) return;
    const shared = Object.values(project.replacements).some((replacement) => replacement.targetPath !== selectedPath && replacement.takes.some((item) => item.opfsPath === take.opfsPath));
    updateProject((current) => {
      const replacement = current.replacements[selectedPath];
      if (!replacement) return current;
      const takes = replacement.takes.filter((item) => item.id !== take.id);
      return { ...current, replacements: { ...current.replacements, [selectedPath]: { ...replacement, takes, activeTakeId: replacement.activeTakeId === take.id ? takes.at(-1)?.id ?? null : replacement.activeTakeId } } };
    });
    if (!shared) await removePrivateFile(take.opfsPath);
  }

  async function exportPack() {
    if (!project || !effectiveCatalog) return;
    const ready = Object.values(project.replacements).filter((replacement) => replacement.activeTakeId);
    if (!ready.length) { setError("Add at least one active replacement before exporting."); return; }
    setBusy("Building resource pack…");
    setError("");
    setExportProgress(0);
    try {
      const filename = `${project.slug}-mc-${project.minecraftVersion}.zip`;
      const exportOptions: ExportOptions = {
        onProgress: (value, message) => { setExportProgress(value); setBusy(`Packing ${message}`); },
        renderReplacement: async (targetPath) => {
          const replacement = project.replacements[targetPath];
          const take = replacement.takes.find((item) => item.id === replacement.activeTakeId);
          if (!take) throw new Error(`Missing active take for ${targetPath}.`);
          const variant = effectiveCatalog.variants[targetPath];
          const target = { sampleRate: variant?.sampleRate || take.sampleRate, channels: variant?.channels || take.channels };
          const rendered = await renderTake(take, replacement.edit, target);
          return { blob: await encodeVorbis(rendered.buffer), peakDb: rendered.peakDb };
        }
      };
      let warnings: string[];
      if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({ suggestedName: filename, types: [{ description: "Minecraft resource pack", accept: { "application/zip": [".zip"] } }] });
        const writable = await handle.createWritable();
        warnings = (await streamResourcePack(project, exportOptions, writable)).warnings;
      } else {
        const result = await buildResourcePack(project, exportOptions);
        warnings = result.warnings;
        downloadBlob(result.blob, filename);
      }
      if (warnings.length) setError(`Exported with ${warnings.length} clipping warning${warnings.length === 1 ? "" : "s"}.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(""); setExportProgress(0); }
  }

  async function flushProject() { if (project) await saveProject(project); }

  return (
    <>
      {!project || !effectiveCatalog ? (
        <Landing
          projects={projects}
          catalogs={index?.catalogs ?? []}
          selectedVersion={selectedVersion}
          storage={storage}
          busy={busy}
          error={error}
          onVersion={(version) => void chooseVersion(version)}
          onCreate={() => void createProject()}
          onImport={(file) => void importProject(file)}
          onOpen={(next) => void openProject(next)}
        />
      ) : (
        <Workspace
          project={project}
          catalog={effectiveCatalog}
          storage={storage}
          selectedPath={selectedPath}
          busy={busy}
          exportProgress={exportProgress}
          onHome={() => { stopPreview(); setProject(null); setError(""); }}
          onSelect={(variant) => { stopPreview(); setSelectedPath(variant.path); }}
          onProject={setProject}
          onImportAudio={(file) => addAudio(file, file.name.replace(/\.[^.]+$/, ""), "import")}
          onRecording={(blob) => addAudio(blob, "Microphone take", "recording")}
          onRecipe={changeRecipe}
          onReset={() => changeRecipe({ ...DEFAULT_RECIPE, trimEnd: project.replacements[selectedPath]?.takes.find((take) => take.id === project.replacements[selectedPath]?.activeTakeId)?.duration ?? null })}
          onApplyEvent={applyToEvent}
          onActivateTake={activateTake}
          onDeleteTake={(take) => void deleteTake(take)}
          onRemoveReplacement={() => updateProject((current) => {
            const replacement = current.replacements[selectedPath];
            return replacement ? { ...current, replacements: { ...current.replacements, [selectedPath]: { ...replacement, activeTakeId: null } } } : current;
          })}
          onExport={() => void exportPack()}
        />
      )}
      {error && project && <div className="error-toast" role="alert"><span>{error}</span><button onClick={() => setError("")}>×</button></div>}
      <UpdatePrompt beforeUpdate={flushProject} />
    </>
  );
}
