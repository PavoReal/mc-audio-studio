import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { StudioProject } from "../types";

interface StudioDatabase extends DBSchema {
  projects: {
    key: string;
    value: StudioProject;
    indexes: { "by-updated": string };
  };
  settings: {
    key: string;
    value: unknown;
  };
}

let databasePromise: Promise<IDBPDatabase<StudioDatabase>> | null = null;

function database(): Promise<IDBPDatabase<StudioDatabase>> {
  if (!databasePromise) {
    databasePromise = openDB<StudioDatabase>("minecraft-sound-studio", 1, {
      upgrade(db) {
        const projects = db.createObjectStore("projects", { keyPath: "id" });
        projects.createIndex("by-updated", "updatedAt");
        db.createObjectStore("settings");
      }
    });
  }
  return databasePromise;
}

export async function listProjects(): Promise<StudioProject[]> {
  const values = await (await database()).getAllFromIndex("projects", "by-updated");
  return values.reverse().map(migrateProject);
}

export async function loadProject(id: string): Promise<StudioProject | undefined> {
  const stored = await (await database()).get("projects", id);
  return stored ? migrateProject(stored) : undefined;
}

export function migrateProject(value: unknown): StudioProject {
  if (!value || typeof value !== "object") throw new Error("Invalid project data.");
  const candidate = value as Partial<StudioProject> & { schemaVersion?: number };
  if (candidate.schemaVersion !== 1) {
    if ((candidate.schemaVersion ?? 0) > 1) {
      throw new Error("This project was created by a newer Sound Studio and cannot be opened safely.");
    }
    throw new Error("This project uses an unsupported legacy schema.");
  }
  // Retired "gold"/"dusk" backdrops fall back to the only remaining scene.
  if (candidate.backdrop !== "day") candidate.backdrop = "day";
  return candidate as StudioProject;
}

export async function saveProject(project: StudioProject): Promise<void> {
  if (project.schemaVersion !== 1) {
    throw new Error(`Unsupported project schema ${project.schemaVersion}.`);
  }
  await (await database()).put("projects", project);
}

export async function deleteProjectMetadata(id: string): Promise<void> {
  await (await database()).delete("projects", id);
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  return (await database()).get("settings", key) as Promise<T | undefined>;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await (await database()).put("settings", value, key);
}
