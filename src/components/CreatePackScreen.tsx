import { useState } from "react";
import { ArrowLeft, FilePlus2, Import } from "lucide-react";
import type { CatalogIndexEntry, StudioProject } from "../types";
import { formatPackFormat } from "../lib/format";

const BACKDROPS: Array<{ id: StudioProject["backdrop"]; label: string }> = [
  { id: "day", label: "Day" },
  { id: "gold", label: "Gold" },
  { id: "dusk", label: "Dusk" }
];

interface Props {
  catalogs: CatalogIndexEntry[];
  selectedVersion: string;
  busy: string;
  onVersion: (version: string) => void;
  onCreate: (name: string, backdrop: StudioProject["backdrop"]) => void;
  onImport: (file: File) => void;
  onBackdropPreview: (backdrop: StudioProject["backdrop"]) => void;
  onBack?: () => void;
}

export function CreatePackScreen(props: Props) {
  const [name, setName] = useState("My Sound Pack");
  const [backdrop, setBackdrop] = useState<StudioProject["backdrop"]>("day");
  const selectedCatalog = props.catalogs.find((entry) => entry.version === props.selectedVersion);
  function chooseBackdrop(next: StudioProject["backdrop"]) {
    setBackdrop(next);
    props.onBackdropPreview(next);
  }
  return (
    <>
      <h1 className="start-title">Create New <em>Sound Pack</em></h1>
      <p className="start-subtitle">Record, trim, and replace Minecraft Java sounds — all on your computer</p>
      <div className="create-form glass-panel">
        <label>
          <span>Pack name</span>
          <input
            type="text"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && !props.busy) props.onCreate(name, backdrop); }}
          />
        </label>
        <div className="version-control">
          <label htmlFor="version">Target release</label>
          <select id="version" value={props.selectedVersion} onChange={(event) => props.onVersion(event.target.value)}>
            {props.catalogs.map((entry) => <option key={entry.version} value={entry.version}>Java {entry.version} · format {formatPackFormat(entry.packFormat)}</option>)}
          </select>
          {selectedCatalog && <span>{selectedCatalog.sounds.toLocaleString()} sound variants indexed</span>}
        </div>
        <div>
          <span className="field-label">Backdrop</span>
          <div className="backdrop-picker" role="group" aria-label="Backdrop">
            {BACKDROPS.map((option) => (
              <button key={option.id} type="button" aria-pressed={backdrop === option.id} onClick={() => chooseBackdrop(option.id)}>
                <span className={`project-orb orb-${option.id}`} /> {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="start-actions">
        {props.onBack && (
          <button className="button button-subtle button-large" onClick={props.onBack}>
            <ArrowLeft size={16} /> Back
          </button>
        )}
        <button className="button button-lime button-large" onClick={() => props.onCreate(name, backdrop)} disabled={Boolean(props.busy)}>
          <FilePlus2 size={17} /> Create
        </button>
        <label className="button button-glass button-large file-button">
          <Import size={17} /> Import Pack ZIP
          <input type="file" accept=".zip,application/zip" onChange={(event) => event.target.files?.[0] && props.onImport(event.target.files[0])} />
        </label>
      </div>
    </>
  );
}
