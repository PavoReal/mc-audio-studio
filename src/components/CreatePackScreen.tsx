import { useState } from "react";
import { ArrowLeft, FilePlus2, Import } from "lucide-react";
import type { CatalogIndexEntry } from "../types";
import { formatPackFormat } from "../lib/format";

interface Props {
  catalogs: CatalogIndexEntry[];
  selectedVersion: string;
  busy: string;
  onVersion: (version: string) => void;
  onCreate: (name: string) => void;
  onImport: (file: File) => void;
  onBack?: () => void;
}

export function CreatePackScreen(props: Props) {
  const [name, setName] = useState("My Sound Pack");
  const selectedCatalog = props.catalogs.find((entry) => entry.version === props.selectedVersion);
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
            onKeyDown={(event) => { if (event.key === "Enter" && !props.busy) props.onCreate(name); }}
          />
        </label>
        <div className="version-control">
          <label htmlFor="version">Target release</label>
          <select id="version" value={props.selectedVersion} onChange={(event) => props.onVersion(event.target.value)}>
            {props.catalogs.map((entry) => <option key={entry.version} value={entry.version}>Java {entry.version} · format {formatPackFormat(entry.packFormat)}</option>)}
          </select>
          {selectedCatalog && <span>{selectedCatalog.sounds.toLocaleString()} sound variants indexed</span>}
        </div>
      </div>
      <div className="start-actions">
        {props.onBack && (
          <button className="button button-subtle button-large" onClick={props.onBack}>
            <ArrowLeft size={16} /> Back
          </button>
        )}
        <button className="button button-lime button-large" onClick={() => props.onCreate(name)} disabled={Boolean(props.busy)}>
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
