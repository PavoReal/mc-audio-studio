import { describe, expect, it } from "vitest";
import { migrateProject } from "./storage";

describe("project migrations", () => {
  it("accepts the current schema", () => {
    const value = { schemaVersion: 1, id: "project" };
    expect(migrateProject(value).id).toBe("project");
  });

  it("refuses newer and legacy projects rather than guessing", () => {
    expect(() => migrateProject({ schemaVersion: 2 })).toThrow(/newer/i);
    expect(() => migrateProject({ schemaVersion: 0 })).toThrow(/legacy/i);
  });
});
