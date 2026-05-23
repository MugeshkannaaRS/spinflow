import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => ({
  plugins: [
    tanstackStart({ server: { entry: "server" } }),
    tailwindcss(),
    tsconfigPaths(),
    VitePWA({
      selfDestroying: mode === "development",
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "logo.svg"],
      manifest: {
        name: "SpinFlow ERP",
        short_name: "SpinFlow",
        description: "Spinning Mill ERP — LoTrac & Operations",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "portrait-primary",
        scope: "/",
        start_url: "/lotrac",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
        shortcuts: [
          {
            name: "Loader Scanner",
            short_name: "Scan",
            url: "/lotrac?tab=loader",
            icons: [{ src: "/pwa-192.png", sizes: "192x192" }],
          },
          {
            name: "Receiver Scanner",
            short_name: "Receive",
            url: "/lotrac?tab=receiver",
            icons: [{ src: "/pwa-192.png", sizes: "192x192" }],
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
        runtimeCaching: [
          {
            urlPattern: /^https?.*\/api\/v1\/(trips|stock|masters)/,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
        ],
      },
    }),
  ],

  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },

  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:8000",
        ws: true,
      },
    },
  },
}));
