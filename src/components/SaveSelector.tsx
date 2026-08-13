import { useState } from "react";
import { FilePlus2, Import, Trash2 } from "lucide-react";
import type { StudioProject } from "../types";
import { formatPackFormat, formatRelativeTime } from "../lib/format";

interface Props {
  projects: StudioProject[];
  busy: string;
  onOpen: (project: StudioProject) => void;
  onDelete: (project: StudioProject) => void;
  onImport: (file: File) => void;
  onCreateNew: () => void;
}

export function SaveSelector(props: Props) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  return (
    <>
      <h1 className="start-title">Select <em>Sound Pack</em></h1>
      <p className="start-subtitle">Autosaved locally in this browser</p>
      <div className="save-list glass-panel">
        {props.projects.map((project) => (
          <div key={project.id} className="save-row">
            <button className="save-row-open" onClick={() => { setConfirmingId(null); props.onOpen(project); }} disabled={Boolean(props.busy)}>
              <span className={`project-orb orb-${project.backdrop}`} />
              <span className="save-row-copy">
                <strong>{project.name}</strong>
                <small>
                  Java {project.minecraftVersion} · format {formatPackFormat(project.packFormat)} · {Object.keys(project.replacements).length} edited · {formatRelativeTime(project.updatedAt)}
                </small>
              </span>
            </button>
            {confirmingId === project.id ? (
              <span className="save-row-confirm">
                <span>Delete pack and its audio?</span>
                <button className="button button-danger" disabled={Boolean(props.busy)} onClick={() => { setConfirmingId(null); props.onDelete(project); }}>Yes</button>
                <button className="button button-subtle" onClick={() => setConfirmingId(null)}>No</button>
              </span>
            ) : (
              <span className="save-row-actions">
                <button className="save-delete" aria-label={`Delete ${project.name}`} onClick={() => setConfirmingId(project.id)}>
                  <Trash2 size={15} />
                </button>
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="start-actions">
        <button className="button button-lime button-large" onClick={props.onCreateNew} disabled={Boolean(props.busy)}>
          <FilePlus2 size={17} /> Create New Pack
        </button>
        <label className="button button-glass button-large file-button">
          <Import size={17} /> Import Pack ZIP
          <input type="file" accept=".zip,application/zip" onChange={(event) => event.target.files?.[0] && props.onImport(event.target.files[0])} />
        </label>
      </div>
    </>
  );
}
