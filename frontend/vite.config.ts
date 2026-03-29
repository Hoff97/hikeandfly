import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const apiProxy = {
  target: "http://127.0.0.1:8000",
  changeOrigin: true,
  ws: true,
};

export default defineConfig({
  base: "/static/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "logo192.png", "logo512.png"],
      manifest: {
        name: "Hike and Fly Glide Area",
        short_name: "Hike&Fly",
        description: "Offline-capable glide area calculator for paragliders.",
        theme_color: "#111111",
        background_color: "#111111",
        display: "standalone",
        start_url: "/static/",
        scope: "/static/",
        icons: [
          {
            src: "logo192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "logo512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [
          /^\/(flight_cone|flight_cone_ws|flight_cone_bounds|raw_height_image|height_map)/,
        ],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/[abc]\.tile\.opentopomap\.org\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "map-tiles",
              cacheableResponse: {
                statuses: [0, 200],
              },
              expiration: {
                maxEntries: 5000,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
          {
            urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "map-tiles",
              cacheableResponse: {
                statuses: [0, 200],
              },
              expiration: {
                maxEntries: 5000,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
          {
            urlPattern: /^https:\/\/server\.arcgisonline\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "map-tiles",
              cacheableResponse: {
                statuses: [0, 200],
              },
              expiration: {
                maxEntries: 5000,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
          {
            urlPattern: /\/opentopomap\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "map-tiles",
              cacheableResponse: {
                statuses: [0, 200],
              },
              expiration: {
                maxEntries: 5000,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      "/flight_cone": apiProxy,
      "/flight_cone_ws": apiProxy,
      "/flight_cone_bounds": apiProxy,
      "/raw_height_image": apiProxy,
      "/agl_image": apiProxy,
      "/height_image": apiProxy,
      "/kml": apiProxy,
      "/search_ws": apiProxy,
      "/flying_sites": apiProxy,
      "/opentopomap": apiProxy,
      "/stats": apiProxy,
      "/height_map": apiProxy,
    },
  },
  test: {
    environment: "jsdom",
  },
});
