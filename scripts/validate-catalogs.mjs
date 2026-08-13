import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const directory = resolve("public/catalogs");
const index = JSON.parse(await readFile(resolve(directory, "index.json"), "utf8"));
if (index.schemaVersion !== 1 || !Array.isArray(index.catalogs) || !index.catalogs.length) {
  throw new Error("Catalog index is empty or has an unsupported schema.");
}

const versions = new Set();
const referencedFiles = new Set(["index.json"]);
for (const entry of index.catalogs) {
  if (entry.type !== "release" || versions.has(entry.version)) throw new Error(`Invalid release entry ${entry.version}.`);
  versions.add(entry.version);
  const filename = basename(entry.path);
  referencedFiles.add(filename);
  if (!filename.includes(entry.sha256.slice(0, 16))) throw new Error(`Catalog ${entry.version} is not content-hashed.`);

  const source = await readFile(resolve(directory, filename));
  const actualHash = createHash("sha256").update(source).digest("hex");
  if (actualHash !== entry.sha256) throw new Error(`SHA-256 mismatch for ${entry.version}.`);
  const catalog = JSON.parse(source.toString("utf8"));
  if (catalog.schemaVersion !== 1 || catalog.version !== entry.version) throw new Error(`Schema mismatch for ${entry.version}.`);
  if (!/^[0-9a-f]{40}$/.test(catalog.assetIndexHash) || !/^[0-9a-f]{40}$/.test(catalog.clientHash) || !/^[0-9a-f]{40}$/.test(catalog.soundsHash)) {
    throw new Error(`Source hashes are invalid for ${entry.version}.`);
  }

  const variants = Object.values(catalog.variants);
  if (variants.length !== entry.sounds || Object.keys(catalog.events).length !== entry.events) {
    throw new Error(`Index counts do not match ${entry.version}.`);
  }
  for (const variant of variants) {
    if (!/^[0-9a-f]{40}$/.test(variant.objectHash)) throw new Error(`Invalid asset hash in ${entry.version}: ${variant.path}`);
    if (!(variant.duration > 0) || !(variant.sampleRate > 0) || ![1, 2].includes(variant.channels)) {
      throw new Error(`Invalid audio metadata in ${entry.version}: ${variant.path}`);
    }
  }
  for (const event of Object.values(catalog.events)) {
    for (const path of event.variants) {
      if (!catalog.variants[path]) throw new Error(`Event ${event.id} references a missing variant in ${entry.version}.`);
    }
  }
}

const orphaned = (await readdir(directory)).filter((filename) => !referencedFiles.has(filename));
if (orphaned.length) throw new Error(`Unreferenced catalog artifacts: ${orphaned.join(", ")}`);
console.log(`Validated ${versions.size} stable Java catalogs with immutable hashes and audio metadata.`);
