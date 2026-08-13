// Production counterpart of the Vite dev/preview proxy (see vite.config.ts):
// serves /vanilla-assets/<h2>/<hash> from the Mojang asset CDN, which sends no
// CORS headers and therefore can't be fetched cross-origin by the app.
const UPSTREAM = "https://resources.download.minecraft.net";
// Mojang layout: /<first-2-hex-of-hash>/<40-hex-sha1>
const VALID_PATH = /^\/vanilla-assets\/([0-9a-f]{2}\/[0-9a-f]{40})$/;

interface Env {
  ASSETS: Fetcher;
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(VALID_PATH);
    if (!match) {
      // run_worker_first scopes the script to /vanilla-assets/*, so anything
      // here without a valid hash is a bad asset path; non-matching methods
      // and stray routes fall back to static assets.
      if (url.pathname.startsWith("/vanilla-assets/") && request.method === "GET") {
        return new Response("Not found", { status: 404 });
      }
      return env.ASSETS.fetch(request);
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 });
    }

    const path = match[1];
    const cache = caches.default;
    const cacheKey = new Request(url.origin + url.pathname);
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
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  }
} satisfies ExportedHandler<Env>;
