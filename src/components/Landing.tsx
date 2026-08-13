import { Archive, ArrowRight, Cloud, FilePlus2, HardDrive, Import, RadioTower, ShieldCheck } from "lucide-react";
import type { CatalogIndexEntry, StorageEstimate, StudioProject } from "../types";
import { APP_NOTICE } from "../constants";
import { formatBytes, formatPackFormat } from "../lib/format";
import { BrandMark } from "./BrandMark";

interface Props {
  projects: StudioProject[];
  catalogs: CatalogIndexEntry[];
  selectedVersion: string;
  storage: StorageEstimate;
  busy: string;
  error: string;
  onVersion: (version: string) => void;
  onCreate: () => void;
  onImport: (file: File) => void;
  onOpen: (project: StudioProject) => void;
}

export function Landing(props: Props) {
  const selectedCatalog = props.catalogs.find((entry) => entry.version === props.selectedVersion);
  return (
    <main className="landing sky-scene scene-day">
      <div className="ambient-lines" />
      <section className="landing-shell">
        <header className="landing-nav">
          <BrandMark />
          <span className="privacy-pill"><ShieldCheck size={14} /> Local only</span>
        </header>
        <div className="landing-copy">
          <p className="eyebrow"><RadioTower size={14} /> Resource pack audio, reimagined</p>
          <h1>Make every sound<br />feel like <em>yours.</em></h1>
          <p className="lede">Record, trim, and replace Minecraft Java sounds in a private studio that runs entirely on your computer.</p>
          <div className="version-control">
            <label htmlFor="version">Target release</label>
            <select id="version" value={props.selectedVersion} onChange={(event) => props.onVersion(event.target.value)}>
              {props.catalogs.map((entry) => <option key={entry.version} value={entry.version}>Java {entry.version} · format {formatPackFormat(entry.packFormat)}</option>)}
            </select>
            {selectedCatalog && <span>{selectedCatalog.sounds.toLocaleString()} sound variants indexed</span>}
          </div>
          <div className="landing-actions">
            <button className="button button-lime button-large" onClick={props.onCreate} disabled={Boolean(props.busy)}>
              <FilePlus2 size={18} /> Create new pack <ArrowRight size={17} />
            </button>
            <label className="button button-glass button-large file-button">
              <Import size={18} /> Import pack ZIP
              <input type="file" accept=".zip,application/zip" onChange={(event) => event.target.files?.[0] && props.onImport(event.target.files[0])} />
            </label>
          </div>
          {props.busy && <p className="inline-status"><span className="spinner" /> {props.busy}</p>}
          {props.error && <p className="error-message" role="alert">{props.error}</p>}
        </div>
        <aside className="landing-stats glass-panel">
          <div><Cloud size={20} /><strong>No cloud</strong><span>Your audio never leaves this browser.</span></div>
          <div><Archive size={20} /><strong>Whole-pack safe</strong><span>Textures, models, and metadata stay intact.</span></div>
          <div><HardDrive size={20} /><strong>{formatBytes(props.storage.usage)} local</strong><span>{formatBytes(props.storage.quota)} browser storage available.</span></div>
        </aside>
        {props.projects.length > 0 && (
          <section className="recent-projects glass-panel" aria-label="Recent projects">
            <div className="section-heading"><span>Recent work</span><small>Autosaved locally</small></div>
            <div className="recent-list">
              {props.projects.slice(0, 3).map((project) => (
                <button key={project.id} onClick={() => props.onOpen(project)}>
                  <span className={`project-orb orb-${project.backdrop}`} />
                  <span><strong>{project.name}</strong><small>Java {project.minecraftVersion} · {Object.keys(project.replacements).length} edited</small></span>
                  <ArrowRight size={16} />
                </button>
              ))}
            </div>
          </section>
        )}
        <footer className="landing-footer"><span>{APP_NOTICE}</span><span>Chrome &amp; Edge desktop · HTTPS required for recording</span></footer>
      </section>
    </main>
  );
}
