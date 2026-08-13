import { describe, expect, it } from "vitest";
import { formatBytes, formatDuration, formatPackFormat, formatRelativeTime, slugify } from "./format";

describe("format helpers", () => {
  it("formats project-facing values", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatDuration(61.24)).toBe("1:01.2");
    expect(formatPackFormat([88, 0])).toBe("88.0");
    expect(slugify("  My Creeper Pack! ")).toBe("my-creeper-pack");
  });

  it("formats relative timestamps for the save selector", () => {
    const now = new Date("2026-08-12T12:00:00Z");
    expect(formatRelativeTime("2026-08-12T11:59:40Z", now)).toBe("just now");
    expect(formatRelativeTime("2026-08-12T11:58:00Z", now)).toBe("2 minutes ago");
    expect(formatRelativeTime("2026-08-12T09:00:00Z", now)).toBe("3 hours ago");
    expect(formatRelativeTime("2026-08-09T12:00:00Z", now)).toBe("3 days ago");
    expect(formatRelativeTime("2025-06-12T12:00:00Z", now)).toBe("last year");
    expect(formatRelativeTime("not-a-date", now)).toBe("");
  });
});
