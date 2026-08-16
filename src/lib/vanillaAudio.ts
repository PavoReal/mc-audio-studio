import type { CatalogVariant } from "../types";
import { decodeAudioBytes } from "./audio";

const buffers = new Map<string, Promise<AudioBuffer | null>>();

/**
 * Fetches and decodes a vanilla sound, cached by object hash. The Mojang CDN
 * sends no CORS headers, so the request goes through the same-origin
 * /vanilla-assets path (proxied by Vite in dev/preview; production hosts need
 * an equivalent rewrite; in production a Cloudflare Pages Function serves it).
 * Decoding uses the shared context and falls back to the WebAssembly Vorbis
 * decoder on browsers without native Ogg Vorbis support (Safari).
 * Resolves to null on any failure (network/CORS/decode); failed entries are
 * evicted so the next call retries instead of sticking for the session.
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
      .then((data) => decodeAudioBytes(data))
      .catch(() => {
        buffers.delete(hash);
        return null;
      });
    buffers.set(hash, entry);
  }
  return entry;
}

export function clearVanillaCache(): void {
  buffers.clear();
}
