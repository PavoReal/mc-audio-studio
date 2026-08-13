import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// The Mojang asset CDN sends no CORS headers, so waveform decoding fetches go
// through this same-origin path. Static production hosts need an equivalent
// rewrite rule; without one the app falls back to "waveform unavailable".
const vanillaAssetProxy = {
  "/vanilla-assets": {
    target: "https://resources.download.minecraft.net",
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/vanilla-assets/, "")
  }
};

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["sky-world-*.png", "pcm-capture.js", "ogg-encoder.worker.js", "middle-layer.wasm", "licenses/*"],
      manifest: {
        name: "Minecraft Sound Studio",
        short_name: "Sound Studio",
        description: "A private, local-first sound resource-pack editor.",
        theme_color: "#071124",
        background_color: "#03060c",
        display: "standalone",
        start_url: "/",
        icons: [
          { "src": "/icon-192.svg", "sizes": "192x192", "type": "image/svg+xml" },
          { "src": "/icon-512.svg", "sizes": "512x512", "type": "image/svg+xml" }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        additionalManifestEntries: [{ url: "/catalogs/index.json", revision: null }],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,svg,png,wasm}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/resources\.download\.minecraft\.net\//,
            handler: "CacheFirst",
            options: {
              cacheName: "vanilla-sound-previews",
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/catalogs/"),
            handler: "CacheFirst",
            options: { cacheName: "minecraft-catalogs" }
          }
        ]
      }
    })
  ],
  server: { port: Number(process.env.PORT) || 4173, strictPort: true, proxy: vanillaAssetProxy },
  preview: { port: Number(process.env.PORT) || 4173, strictPort: true, proxy: vanillaAssetProxy }
});
