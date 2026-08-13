import { VANILLA_ASSET_ROOT } from "../constants";
import type { CatalogIndex, CatalogIndexEntry, CatalogVariant, SoundCatalog } from "../types";

const FALLBACK_INDEX: CatalogIndex = {
  schemaVersion: 1,
  generatedAt: "2026-08-11T00:00:00Z",
  catalogs: [
    {
      version: "26.2",
      type: "release",
      packFormat: [88, 0],
      path: "/catalogs/26.2.json",
      sha256: "development-catalog",
      sounds: 12,
      events: 12
    }
  ]
};

export async function loadCatalogIndex(): Promise<CatalogIndex> {
  try {
    const response = await fetch("/catalogs/index.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(String(response.status));
    const index = await response.json() as CatalogIndex;
    if (index.schemaVersion !== 1 || !Array.isArray(index.catalogs)) throw new Error("Invalid catalog index");
    return index;
  } catch {
    return FALLBACK_INDEX;
  }
}

export async function loadCatalog(entry: CatalogIndexEntry): Promise<SoundCatalog> {
  const response = await fetch(entry.path);
  if (!response.ok) throw new Error(`Could not load the Minecraft ${entry.version} sound catalog.`);
  const source = await response.text();
  if (entry.sha256 !== "development-catalog") {
    const bytes = new TextEncoder().encode(source);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    if (actual !== entry.sha256) throw new Error(`Catalog ${entry.version} failed integrity verification.`);
  }
  const catalog = JSON.parse(source) as SoundCatalog;
  if (catalog.schemaVersion !== 1 || catalog.version !== entry.version) {
    throw new Error(`Catalog ${entry.version} has an unsupported schema.`);
  }
  return catalog;
}

export function vanillaSoundUrl(variant: CatalogVariant): string {
  return `${VANILLA_ASSET_ROOT}/${variant.objectHash.slice(0, 2)}/${variant.objectHash}`;
}

export function categoryFor(variant: CatalogVariant): string {
  if (!variant.events.length) return "unmapped";
  return variant.events[0].split(".", 1)[0] || "unmapped";
}

export const ESSENTIALS_CATEGORY = "essentials";

// Hand-picked events that resource-pack makers most often override:
// UI feedback, player feedback, iconic mobs, containers, combat, and weather.
const ESSENTIAL_EVENTS = new Set([
  "ui.button.click",
  "ui.toast.challenge_complete",
  "entity.player.levelup",
  "entity.experience_orb.pickup",
  "entity.item.pickup",
  "entity.player.hurt",
  "entity.player.death",
  "entity.player.big_fall",
  "entity.player.attack.crit",
  "entity.player.attack.strong",
  "entity.player.attack.sweep",
  "entity.player.burp",
  "entity.generic.eat",
  "entity.generic.drink",
  "entity.generic.explode",
  "entity.generic.hurt",
  "entity.generic.death",
  "entity.tnt.primed",
  "entity.creeper.primed",
  "entity.creeper.hurt",
  "entity.creeper.death",
  "entity.zombie.ambient",
  "entity.zombie.hurt",
  "entity.zombie.death",
  "entity.skeleton.ambient",
  "entity.skeleton.hurt",
  "entity.skeleton.death",
  "entity.skeleton.shoot",
  "entity.enderman.ambient",
  "entity.enderman.scream",
  "entity.enderman.stare",
  "entity.enderman.teleport",
  "entity.ghast.scream",
  "entity.villager.ambient",
  "entity.villager.trade",
  "entity.villager.hurt",
  "entity.villager.no",
  "entity.villager.yes",
  "entity.pig.ambient",
  "entity.cow.ambient",
  "entity.chicken.ambient",
  "entity.sheep.ambient",
  "entity.cat.ambient",
  "entity.wolf.ambient",
  "entity.arrow.shoot",
  "entity.arrow.hit_player",
  "entity.ender_pearl.throw",
  "block.chest.open",
  "block.chest.close",
  "block.ender_chest.open",
  "block.ender_chest.close",
  "block.wooden_door.open",
  "block.wooden_door.close",
  "block.anvil.use",
  "block.anvil.land",
  "block.portal.travel",
  "block.portal.trigger",
  "weather.rain",
  "entity.lightning_bolt.thunder",
  "item.totem.use",
  "entity.wither.spawn",
  "entity.wither.death",
  "entity.ender_dragon.growl",
  "entity.ender_dragon.death",
  "entity.firework_rocket.launch",
  "entity.firework_rocket.blast",
  "entity.firework_rocket.twinkle"
]);

export function isEssentialVariant(variant: CatalogVariant): boolean {
  return variant.events.some((event) => ESSENTIAL_EVENTS.has(event));
}

export function searchCatalog(
  catalog: SoundCatalog,
  query: string,
  category = "all"
): CatalogVariant[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return Object.values(catalog.variants)
    .filter((variant) => {
      if (category === "all") return true;
      if (category === ESSENTIALS_CATEGORY) return isEssentialVariant(variant);
      return variant.events.some((event) => event.startsWith(`${category}.`));
    })
    .filter((variant) => {
      const haystack = `${variant.path} ${variant.events.join(" ")}`.toLocaleLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .sort((a, b) => {
      const aEvent = a.events[0] ?? "zzzz";
      const bEvent = b.events[0] ?? "zzzz";
      return aEvent.localeCompare(bEvent) || a.path.localeCompare(b.path);
    });
}

export function catalogCategories(catalog: SoundCatalog): string[] {
  return Array.from(new Set(Object.values(catalog.variants).flatMap((variant) =>
    variant.events.length ? variant.events.map((event) => event.split(".", 1)[0]) : ["unmapped"]
  ))).sort();
}
