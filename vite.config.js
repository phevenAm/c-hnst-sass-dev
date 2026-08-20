import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

function versionJsonPlugin() {
  return {
    name: "generate-version-json",
    buildStart() {
      writeFileSync("./public/version.json", JSON.stringify({ version: pkg.version }));
    },
  };
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    versionJsonPlugin(),
    VitePWA({
      // "prompt" (not "autoUpdate"): autoUpdate makes a newly-deployed
      // service worker call skipWaiting()+clientsClaim() the moment it
      // installs, silently taking over every open tab mid-session — the
      // already-running app keeps executing but its network requests are
      // now served by a worker built for a different bundle. "prompt"
      // installs the new worker but leaves it waiting until updateSW() is
      // called (wired in index.tsx via UpdateBanner's "Update now"), so the
      // swap only happens deliberately, together with a reload.
      registerType: "prompt",
      manifest: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallback: "/index.html",
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],

  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@components": fileURLToPath(new URL("./src/components", import.meta.url)),
      "@pages": fileURLToPath(new URL("./src/pages", import.meta.url)),
      "@context": fileURLToPath(new URL("./src/context", import.meta.url)),
      "@store": fileURLToPath(new URL("./src/store", import.meta.url)),
      "@models": fileURLToPath(new URL("./src/models", import.meta.url)),
      "@styles": fileURLToPath(new URL("./src/styles", import.meta.url)),
      "@lib": fileURLToPath(new URL("./src/lib", import.meta.url)),
      "@Helpers": fileURLToPath(new URL("./src/Helpers", import.meta.url)),
      "@Hooks": fileURLToPath(new URL("./src/Hooks", import.meta.url)),
      "@services": fileURLToPath(new URL("./src/services", import.meta.url)),
      "@constants": fileURLToPath(new URL("./src/constants", import.meta.url)),
    },
  },

  css: {
    devSourcemap: true,
  },
  server: {
    port: 5174,
    historyApiFallback: true,
  },
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx,js}"],
    environment: "jsdom",
    setupFiles: "src/test/setupTests.js",
    env: {
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co",
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || "placeholder-anon-key",
    },
    coverage: {
      provider: "istanbul",
    },
  },
});
