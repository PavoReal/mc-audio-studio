import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { CatalogIndexEntry, StorageEstimate, StudioProject } from "../types";
import { APP_NOTICE } from "../constants";
import { formatBytes } from "../lib/format";
import { BrandMark } from "./BrandMark";
import { CreatePackScreen } from "./CreatePackScreen";
import { SaveSelector } from "./SaveSelector";

interface Props {
  projects: StudioProject[];
  catalogs: CatalogIndexEntry[];
  selectedVersion: string;
  storage: StorageEstimate;
  busy: string;
  error: string;
  onVersion: (version: string) => void;
  onCreate: (name: string) => void;
  onImport: (file: File) => void;
  onOpen: (project: StudioProject) => void;
  onDelete: (project: StudioProject) => void;
}

export function StartPage(props: Props) {
  const [explicitView, setExplicitView] = useState<"selector" | "create" | null>(null);
  const view = props.projects.length > 0 ? explicitView ?? "selector" : "create";
  return (
    <main className="landing sky-scene scene-day">
      <div className="ambient-lines" />
      <section className="landing-shell start-page">
        <header className="landing-nav">
          <BrandMark />
          <span className="privacy-pill"><ShieldCheck size={14} /> Local only</span>
        </header>
        <div className="start-column">
          {view === "selector" ? (
            <SaveSelector
              projects={props.projects}
              busy={props.busy}
              onOpen={props.onOpen}
              onDelete={props.onDelete}
              onImport={props.onImport}
              onCreateNew={() => setExplicitView("create")}
            />
          ) : (
            <CreatePackScreen
              catalogs={props.catalogs}
              selectedVersion={props.selectedVersion}
              busy={props.busy}
              onVersion={props.onVersion}
              onCreate={props.onCreate}
              onImport={props.onImport}
              onBack={props.projects.length > 0 ? () => setExplicitView("selector") : undefined}
            />
          )}
          <div className="start-status">
            {props.busy && <p className="inline-status"><span className="spinner" /> {props.busy}</p>}
            {props.error && <p className="error-message" role="alert">{props.error}</p>}
          </div>
          <p className="start-footnote">{formatBytes(props.storage.usage)} of {formatBytes(props.storage.quota)} browser storage used · everything stays on this computer</p>
        </div>
        <footer className="landing-footer"><span>{APP_NOTICE}</span><span>Chrome &amp; Edge desktop · HTTPS required for recording</span></footer>
      </section>
    </main>
  );
}
