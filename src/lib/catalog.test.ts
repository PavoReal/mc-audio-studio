import { describe, expect, it } from "vitest";
import type { SoundCatalog } from "../types";
import { catalogCategories, ESSENTIALS_CATEGORY, searchCatalog, vanillaSoundUrl } from "./catalog";

const catalog: SoundCatalog = {
  schemaVersion: 1,
  version: "test",
  packFormat: [88, 0],
  assetIndex: "test",
  assetIndexHash: "",
  clientHash: "",
  soundsHash: "",
  generatedAt: "",
  events: {},
  variants: {
    "minecraft/sounds/entity/creeper/primed.ogg": {
      path: "minecraft/sounds/entity/creeper/primed.ogg",
      objectHash: "abcdef012345",
      events: ["entity.creeper.primed"],
      directEvents: ["entity.creeper.primed"],
      metadata: [], duration: 1, sampleRate: 48000, channels: 1
    },
    "minecraft/sounds/ui/click.ogg": {
      path: "minecraft/sounds/ui/click.ogg",
      objectHash: "123456abcdef",
      events: ["ui.button.click"],
      directEvents: ["ui.button.click"],
      metadata: [], duration: 0.2, sampleRate: 44100, channels: 2
    },
    "minecraft/sounds/mob/silverfish/step1.ogg": {
      path: "minecraft/sounds/mob/silverfish/step1.ogg",
      objectHash: "fedcba654321",
      events: ["entity.silverfish.step"],
      directEvents: ["entity.silverfish.step"],
      metadata: [], duration: 0.3, sampleRate: 44100, channels: 1
    }
  }
};

describe("catalog", () => {
  it("searches event IDs and categories", () => {
    expect(searchCatalog(catalog, "creeper primed", "entity").map((item) => item.path)).toEqual([
      "minecraft/sounds/entity/creeper/primed.ogg"
    ]);
    expect(catalogCategories(catalog)).toEqual(["entity", "ui"]);
  });

  it("keeps only curated events in the essentials category", () => {
    expect(searchCatalog(catalog, "", ESSENTIALS_CATEGORY).map((item) => item.path)).toEqual([
      "minecraft/sounds/entity/creeper/primed.ogg",
      "minecraft/sounds/ui/click.ogg"
    ]);
  });

  it("builds official asset URLs from hashes", () => {
    expect(vanillaSoundUrl(catalog.variants["minecraft/sounds/ui/click.ogg"])).toContain("/12/123456abcdef");
  });
});
