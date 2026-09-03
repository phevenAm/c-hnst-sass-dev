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

// The site is one deploy serving two documents:
//   /            → index.html  (static marketing page, no React)
//   everything   → app.html    (the React SPA shell)
// Vercel/Netlify handle that split in production via rewrites; this
// plugin reproduces it for `vite` dev so deep links like /login work.
function promoRoutingPlugin() {
  return {
    name: "promo-dev-routing",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = (req.url || "").split("?")[0];
        const accept = req.headers.accept || "";
        // Only rewrite top-level page navigations; let assets/modules/HMR through.
        if (req.method !== "GET" || !accept.includes("text/html")) return next();
        if (url === "/" || url === "/index.html" || url === "/app.html" || url.startsWith("/promo")) {
          return next();
        }
        req.url = "/app.html";
        next();
      });
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
    promoRoutingPlugin(),
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
        // Keep the marketing page out of the precache. It's a plain landing
        // page with no offline need, and precaching it means a stale service
        // worker serves an old index.html pointing at a CSS hash that no
        // longer exists after a deploy — "/" renders unstyled until a hard
        // refresh. Ignoring it forces "/" to always hit the network.
        // ...as does the marketing page's own imagery (the one .png the app
        // itself never references).
        globIgnores: ["index.html", "reviews/**"],
        // The installable app is app.html; index.html is the marketing page.
        navigateFallback: "/app.html",
        navigateFallbackDenylist: [/^\/$/, /^\/promo/],
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

  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        app: fileURLToPath(new URL("./app.html", import.meta.url)),
      },
      output: {
        // Split the big, rarely-changing vendors into their own chunks so a
        // one-line app change doesn't invalidate the whole cache, and so a
        // lazy route that doesn't touch charts/calendar never downloads them.
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "mui-vendor": ["@mui/material", "@mui/icons-material", "@mui/x-date-pickers"],
          charts: ["recharts"],
          calendar: ["react-big-calendar"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },

  // jspdf + jspdf-autotable are only ever reached through `await import(...)`
  // in export handlers (invoices, expenses, CPD). Vite's dep scanner doesn't
  // always discover import-only-on-demand deps on the first pass, so the first
  // click can 500 with "Failed to fetch dynamically imported module:
  // .vite/deps/jspdf.js". Pre-bundling them removes the discovery race.
  optimizeDeps: {
    include: ["jspdf", "jspdf-autotable"],
  },

  css: {
    devSourcemap: true,
  },
  server: {
    port: 5174,
    historyApiFallback: true,
  },
  test: {
    include: [
      "src/**/*.{test,spec}.{ts,tsx,js}",
      // Pure, Deno-free logic extracted from edge functions is unit-tested here too.
      "supabase/functions/**/*.{test,spec}.ts",
    ],
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
