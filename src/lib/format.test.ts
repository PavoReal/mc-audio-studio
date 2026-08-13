import { describe, expect, it } from "vitest";
import { formatBytes, formatDuration, formatPackFormat, slugify } from "./format";

describe("format helpers", () => {
  it("formats project-facing values", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatDuration(61.24)).toBe("1:01.2");
    expect(formatPackFormat([88, 0])).toBe("88.0");
    expect(slugify("  My Creeper Pack! ")).toBe("my-creeper-pack");
  });
});
