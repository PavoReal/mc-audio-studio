import type { CatalogVariant } from "../types";
import { audioContext } from "./audio";

const buffers = new Map<string, Promise<AudioBuffer | null>>();

/**
 * Fetches and decodes a vanilla sound, cached by object hash. The Mojang CDN
 * sends no CORS headers, so the request goes through the same-origin
 * /vanilla-assets path (proxied by Vite in dev/preview; production hosts need
 * an equivalent rewrite). Resolves to null on any failure (network/CORS/decode);
 * failures are cached too, so a broken asset is only attempted once per session.
 */
export function fetchVanillaBuffer(variant: CatalogVariant): Promise<AudioBuffer | null> {
  const hash = variant.objectHash;
  if (!hash) return Promise.resolve(null);
  let entry = buffers.get(hash);
  if (!entry) {
    entry = fetch(`/vanilla-assets/${hash.slice(0, 2)}/${hash}`)
      .then((response) => {
        if (!response.ok || response.headers.get("content-type")?.includes("text/html")) {
          throw new Error(`Vanilla asset request failed (${response.status}).`);
        }
        return response.arrayBuffer();
      })
      .then((data) => audioContext().decodeAudioData(data))
      .catch(() => null);
    buffers.set(hash, entry);
  }
  return entry;
}

export function clearVanillaCache(): void {
  buffers.clear();
}
