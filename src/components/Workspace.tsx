import { ArrowLeft, Download, Layers3, Mic2, Music4, PanelRightOpen, Settings2, Share2 } from "lucide-react";
import { useMemo, useState } from "react";
import { catalogCategories, ESSENTIALS_CATEGORY } from "../lib/catalog";
import { useMediaQuery } from "../hooks/useMediaQuery";
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
  onShare?: () => void;
}

type MobileTab = "sounds" | "studio" | "details";

export function Workspace(props: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ESSENTIALS_CATEGORY);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("studio");
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const categories = useMemo(() => catalogCategories(props.catalog), [props.catalog]);
  const selected = props.catalog.variants[props.selectedPath] ?? Object.values(props.catalog.variants)[0];
  if (!selected) return <div className="fatal-error">The selected catalog contains no sounds.</div>;
  const editedCount = Object.values(props.project.replacements).filter((replacement) => replacement.activeTakeId).length;

  function selectSound(variant: CatalogVariant) {
    props.onSelect(variant);
    if (isMobile) setMobileTab("studio");
  }

  const showLibrary = !isMobile || mobileTab === "sounds";
  const showEditor = !isMobile || mobileTab === "studio";
  const showInspector = !isMobile || mobileTab === "details";

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
            <button className="icon-button desktop-inspector" onClick={() => setInspectorOpen(true)} title="Open inspector"><PanelRightOpen size={17} /></button>
            <div className="export-split">
              <button className="button button-amber" onClick={props.onExport} disabled={Boolean(props.busy)} aria-label="Export pack">
                <Download size={16} /><span className="button-label">Export pack</span>
              </button>
              {props.onShare && (
                <button className="button button-amber export-share" onClick={props.onShare} disabled={Boolean(props.busy)} title="Share pack" aria-label="Share pack">
                  <Share2 size={16} />
                </button>
              )}
            </div>
          </div>
        </header>
        {props.busy && <div className="global-progress"><i style={{ width: `${props.exportProgress * 100}%` }} /><span>{props.busy}</span></div>}
        <div className="workspace-grid">
          {showLibrary && (
            <SoundLibrary
              catalog={props.catalog}
              project={props.project}
              selectedPath={selected.path}
              query={query}
              category={category}
              categories={categories}
              onQuery={setQuery}
              onCategory={setCategory}
              onSelect={selectSound}
            />
          )}
          {showEditor && (
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
          )}
          {showInspector && (
            <Inspector
              open={isMobile || inspectorOpen}
              project={props.project}
              variant={selected}
              storage={props.storage}
              onClose={() => setInspectorOpen(false)}
              onActivateTake={props.onActivateTake}
              onDeleteTake={props.onDeleteTake}
              onRemoveReplacement={props.onRemoveReplacement}
            />
          )}
        </div>
        {!isMobile && (
          <footer className="workspace-footer">
            <span><i className="online-dot" /> Project autosaved in this browser</span>
            <span>Export a ZIP for a durable backup</span>
            <button onClick={() => setInspectorOpen(true)}><Settings2 size={13} /> Inspector</button>
          </footer>
        )}
      </section>
      {isMobile && (
        <nav className="mobile-tabbar" aria-label="Studio sections">
          <button className={mobileTab === "sounds" ? "active" : ""} onClick={() => setMobileTab("sounds")} aria-pressed={mobileTab === "sounds"}>
            <Music4 size={18} /><span>Sounds</span>
          </button>
          <button className={mobileTab === "studio" ? "active" : ""} onClick={() => setMobileTab("studio")} aria-pressed={mobileTab === "studio"}>
            <Mic2 size={18} /><span>Studio</span>
          </button>
          <button className={mobileTab === "details" ? "active" : ""} onClick={() => setMobileTab("details")} aria-pressed={mobileTab === "details"}>
            <Layers3 size={18} /><span>Details</span>
          </button>
        </nav>
      )}
      {!isMobile && inspectorOpen && <button className="drawer-scrim" onClick={() => setInspectorOpen(false)} aria-label="Close inspector drawer" />}
    </main>
  );
}
