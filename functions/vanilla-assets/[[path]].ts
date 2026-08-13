// Production counterpart of the Vite dev/preview proxy (see vite.config.ts):
// serves /vanilla-assets/<h2>/<hash> from the Mojang asset CDN, which sends no
// CORS headers and therefore can't be fetched cross-origin by the app.
const UPSTREAM = "https://resources.download.minecraft.net";
// Mojang layout: /<first-2-hex-of-hash>/<40-hex-sha1>
const VALID_PATH = /^[0-9a-f]{2}\/[0-9a-f]{40}$/;

export const onRequestGet: PagesFunction = async ({ params, request, waitUntil }) => {
  const segments = Array.isArray(params.path) ? params.path : [params.path];
  const path = segments.join("/");
  if (!VALID_PATH.test(path)) return new Response("Not found", { status: 404 });

  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).origin + `/vanilla-assets/${path}`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const upstream = await fetch(`${UPSTREAM}/${path}`);
  if (!upstream.ok) {
    return new Response(`Upstream error ${upstream.status}`, {
      status: upstream.status === 404 ? 404 : 502
    });
  }
  const response = new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/octet-stream",
      // Assets are content-addressed by hash, so they never change.
      "cache-control": "public, max-age=31536000, immutable"
    }
  });
  waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};
