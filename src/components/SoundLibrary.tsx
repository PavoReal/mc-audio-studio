import { Check, Circle, Search, Sparkles } from "lucide-react";
import { searchCatalog } from "../lib/catalog";
import { relativeSoundPath } from "../lib/format";
import type { CatalogVariant, SoundCatalog, StudioProject } from "../types";

interface Props {
  catalog: SoundCatalog;
  project: StudioProject;
  selectedPath: string;
  query: string;
  category: string;
  categories: string[];
  onQuery: (value: string) => void;
  onCategory: (value: string) => void;
  onSelect: (variant: CatalogVariant) => void;
}

export function SoundLibrary(props: Props) {
  const allResults = searchCatalog(props.catalog, props.query, props.category);
  const results = allResults.slice(0, 400);
  return (
    <aside className="library-panel glass-panel">
      <div className="panel-title-row">
        <div><p className="eyebrow">Sound library</p><h2>Find a moment</h2></div>
      </div>
      <label className="search-field">
        <Search size={16} />
        <input value={props.query} onChange={(event) => props.onQuery(event.target.value)} placeholder="creeper, rain, click…" />
        {props.query && <button onClick={() => props.onQuery("")} aria-label="Clear search">×</button>}
      </label>
      <div className="category-strip" aria-label="Sound categories">
        {["all", ...props.categories].map((category) => (
          <button key={category} className={props.category === category ? "active" : ""} onClick={() => props.onCategory(category)}>{category}</button>
        ))}
      </div>
      <div className="result-meta"><span>{allResults.length.toLocaleString()} variants</span>{allResults.length > results.length && <small>showing first {results.length}</small>}</div>
      <div className="sound-list" role="listbox" aria-label="Sound variants">
        {results.map((variant) => {
          const replacement = props.project.replacements[variant.path];
          const selected = variant.path === props.selectedPath;
          return (
            <button
              key={variant.path}
              role="option"
              aria-selected={selected}
              className={`sound-row ${selected ? "selected" : ""}`}
              onClick={() => props.onSelect(variant)}
            >
              <span className={`sound-status ${replacement?.activeTakeId ? "ready" : ""}`}>
                {replacement?.activeTakeId ? <Check size={12} /> : <Circle size={8} />}
              </span>
              <span className="sound-copy">
                <strong>{relativeSoundPath(variant.path).replace(/\.ogg$/i, "")}</strong>
                <small>{variant.events[0] ?? "Unmapped sound"}</small>
              </span>
              {variant.events.length > 1 && <span className="usage-count">+{variant.events.length - 1}</span>}
            </button>
          );
        })}
        {!results.length && <div className="empty-list"><Sparkles size={22} /><strong>No sounds found</strong><span>Try another search or category.</span></div>}
      </div>
    </aside>
  );
}
