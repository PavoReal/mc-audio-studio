import type { EditRecipe } from "./types";

export const PROJECT_SCHEMA = 1 as const;
export const DEFAULT_RECIPE: EditRecipe = {
  trimStart: 0,
  trimEnd: null,
  gainDb: 0
};

export const PACK_LIMITS = {
  compressedBytes: 4 * 1024 ** 3,
  entries: 50_000,
  expandedBytes: 8 * 1024 ** 3,
  compressionRatio: 200,
  compressionRatioMinBytes: 10 * 1024 ** 2,
  editableDecodedBytes: 512 * 1024 ** 2
} as const;

export const VANILLA_ASSET_ROOT = "https://resources.download.minecraft.net";
export const APP_NOTICE = "Unofficial tool; not approved by Mojang or Microsoft.";

export const COMMON_EVENTS = [
  "ui.button.click",
  "entity.item.pickup",
  "entity.experience_orb.pickup",
  "entity.player.levelup",
  "entity.player.hurt",
  "entity.player.death",
  "entity.player.attack.strong",
  "entity.player.attack.crit",
  "entity.generic.explode",
  "entity.creeper.primed",
  "entity.zombie.ambient",
  "weather.rain"
] as const;
