import { ArrowLeft, Download, Palette, PanelRightOpen, Settings2 } from "lucide-react";
import { useMemo, useState } from "react";
import { catalogCategories, ESSENTIALS_CATEGORY } from "../lib/catalog";
import type { AudioTake, CatalogVariant, EditRecipe, SoundCatalog, StorageEstimate, StudioProject } from "../types";
import { Inspector } from "./Inspector";
import { SoundLibrary } from "./SoundLibrary";
import { WaveformEditor } from "./WaveformEditor";

interface Props {
  project: StudioProject;
  catalog: SoundCatalog;
  storage: StorageEstimate;
  selectedPath: string;
  busy: string;
  exportProgress: number;
  onHome: () => void;
  onSelect: (variant: CatalogVariant) => void;
  onProject: (project: StudioProject) => void;
  onImportAudio: (file: File) => Promise<void>;
  onRecording: (blob: Blob) => Promise<void>;
  onRecipe: (recipe: EditRecipe) => void;
  onReset: () => void;
  onApplyEvent: () => void;
  onActivateTake: (take: AudioTake) => void;
  onDeleteTake: (take: AudioTake) => void;
  onRemoveReplacement: () => void;
  onExport: () => void;
}

export function Workspace(props: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ESSENTIALS_CATEGORY);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const categories = useMemo(() => catalogCategories(props.catalog), [props.catalog]);
  const selected = props.catalog.variants[props.selectedPath] ?? Object.values(props.catalog.variants)[0];
  if (!selected) return <div className="fatal-error">The selected catalog contains no sounds.</div>;
  const editedCount = Object.values(props.project.replacements).filter((replacement) => replacement.activeTakeId).length;
  return (
    <main className={`workspace sky-scene scene-${props.project.backdrop}`}>
      <div className="ambient-lines" />
      <section className="workspace-shell">
        <header className="workspace-header">
          <button className="back-button" onClick={props.onHome} aria-label="Back to projects"><ArrowLeft size={17} /></button>
          <div className="pack-title">
            <input
              value={props.project.name}
              aria-label="Pack name"
              onChange={(event) => props.onProject({ ...props.project, name: event.target.value, updatedAt: new Date().toISOString() })}
            />
            <span>Java {props.project.minecraftVersion} · {editedCount} replacements</span>
          </div>
          <div className="workspace-header-actions">
            <div className="theme-switcher">
              <button title="Change sky world"><Palette size={16} /></button>
              <select value={props.project.backdrop} aria-label="Background scene" onChange={(event) => props.onProject({ ...props.project, backdrop: event.target.value as StudioProject["backdrop"], updatedAt: new Date().toISOString() })}>
                <option value="day">Day peak</option><option value="gold">Golden peak</option><option value="dusk">Dusk peak</option>
              </select>
            </div>
            <button className="icon-button desktop-inspector" onClick={() => setInspectorOpen(true)} title="Open inspector"><PanelRightOpen size={17} /></button>
            <button className="button button-amber" onClick={props.onExport} disabled={Boolean(props.busy)}><Download size={16} /> Export pack</button>
          </div>
        </header>
        {props.busy && <div className="global-progress"><i style={{ width: `${props.exportProgress * 100}%` }} /><span>{props.busy}</span></div>}
        <div className="workspace-grid">
          <SoundLibrary
            catalog={props.catalog}
            project={props.project}
            selectedPath={selected.path}
            query={query}
            category={category}
            categories={categories}
            onQuery={setQuery}
            onCategory={setCategory}
            onSelect={props.onSelect}
          />
          <WaveformEditor
            variant={selected}
            replacement={props.project.replacements[selected.path] ?? null}
            busy={props.busy}
            onImport={props.onImportAudio}
            onRecording={props.onRecording}
            onRecipe={props.onRecipe}
            onReset={props.onReset}
            onApplyEvent={props.onApplyEvent}
          />
          <Inspector
            open={inspectorOpen}
            project={props.project}
            variant={selected}
            storage={props.storage}
            onClose={() => setInspectorOpen(false)}
            onActivateTake={props.onActivateTake}
            onDeleteTake={props.onDeleteTake}
            onRemoveReplacement={props.onRemoveReplacement}
          />
        </div>
        <footer className="workspace-footer">
          <span><i className="online-dot" /> Project autosaved in this browser</span>
          <span>Export a ZIP for a durable backup</span>
          <button onClick={() => setInspectorOpen(true)}><Settings2 size={13} /> Inspector</button>
        </footer>
      </section>
      {inspectorOpen && <button className="drawer-scrim" onClick={() => setInspectorOpen(false)} aria-label="Close inspector drawer" />}
    </main>
  );
}
