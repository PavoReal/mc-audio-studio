import { AlertTriangle, Check, Circle, Clock3, FileArchive, HardDrive, Info, Layers3, Trash2, X } from "lucide-react";
import type { AudioTake, CatalogVariant, StorageEstimate, StudioProject } from "../types";
import { formatBytes, formatDuration } from "../lib/format";

interface Props {
  open: boolean;
  project: StudioProject;
  variant: CatalogVariant;
  storage: StorageEstimate;
  onClose: () => void;
  onActivateTake: (take: AudioTake) => void;
  onDeleteTake: (take: AudioTake) => void;
  onRemoveReplacement: () => void;
}

export function Inspector(props: Props) {
  const replacement = props.project.replacements[props.variant.path];
  const active = replacement?.takes.find((take) => take.id === replacement.activeTakeId);
  return (
    <aside className={`inspector-panel glass-panel ${props.open ? "open" : ""}`}>
      <div className="inspector-header">
        <div><p className="eyebrow">Inspector</p><h2>Sound details</h2></div>
        <button className="icon-button inspector-close" onClick={props.onClose} aria-label="Close inspector"><X size={18} /></button>
      </div>
      <div className="status-card">
        <span className={`large-status ${active ? "ready" : ""}`}>{active ? <Check size={17} /> : <Circle size={10} />}</span>
        <div><strong>{active ? "Replacement ready" : "Using vanilla"}</strong><span>{active ? "Included in the next export" : "Record or import a custom take"}</span></div>
      </div>
      <section className="inspector-section">
        <h3><Layers3 size={15} /> Used by {props.variant.events.length || 0} events</h3>
        <div className="event-list">
          {props.variant.events.slice(0, 8).map((event) => <span key={event}>{event}</span>)}
          {!props.variant.events.length && <span className="muted-copy">No event mapping in this catalog.</span>}
          {props.variant.events.length > 8 && <span>+{props.variant.events.length - 8} more</span>}
        </div>
      </section>
      <section className="inspector-section">
        <div className="section-title-action"><h3><Clock3 size={15} /> Takes</h3><span>{replacement?.takes.length ?? 0}</span></div>
        <div className="takes-list">
          {replacement?.takes.map((take) => (
            <div className={`take-row ${take.id === replacement.activeTakeId ? "active" : ""}`} key={take.id}>
              <button onClick={() => props.onActivateTake(take)}>
                <span className="take-radio">{take.id === replacement.activeTakeId && <i />}</span>
                <span><strong>{take.label}</strong><small>{formatDuration(take.duration)} · {take.origin}</small></span>
              </button>
              <button className="take-delete" onClick={() => props.onDeleteTake(take)} title="Delete take"><Trash2 size={14} /></button>
            </div>
          ))}
          {!replacement?.takes.length && <div className="empty-takes">Raw recordings and imports will appear here.</div>}
        </div>
        {active && <button className="text-danger" onClick={props.onRemoveReplacement}>Remove active replacement</button>}
      </section>
      {props.project.importDiagnostics.length > 0 && (
        <section className="inspector-section diagnostics">
          <h3><AlertTriangle size={15} /> Import repairs</h3>
          {props.project.importDiagnostics.map((diagnostic) => <p key={diagnostic.code}>{diagnostic.message}</p>)}
        </section>
      )}
      <section className="inspector-section pack-summary">
        <h3><FileArchive size={15} /> Pack source</h3>
        <dl>
          <div><dt>Base archive</dt><dd>{props.project.baseArchiveName ?? "New pack"}</dd></div>
          <div><dt>Preserved files</dt><dd>{props.project.packEntries.filter((entry) => !entry.directory).length.toLocaleString()}</dd></div>
          <div><dt>Editable OGGs</dt><dd>{props.project.packEntries.filter((entry) => entry.editableAudio).length.toLocaleString()}</dd></div>
        </dl>
      </section>
      <section className="storage-mini">
        <span><HardDrive size={14} /> Browser storage</span>
        <strong>{formatBytes(props.storage.usage)} / {formatBytes(props.storage.quota)}</strong>
        <div><i style={{ width: `${Math.min(100, props.storage.usage / Math.max(1, props.storage.quota) * 100)}%` }} /></div>
        <small><Info size={12} /> Clearing site data removes editable projects.</small>
      </section>
    </aside>
  );
}
