import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  use: {
    headless: true,
    baseURL: "http://localhost:5174",
    // Only tests that actually destructure `page` (or another browser
    // fixture) spin up a browser context at all — Playwright creates
    // fixtures lazily — so this only produces real recordings for UI-driving
    // specs; the many API-only e2e tests (plain fetch()/dbQuery() against
    // Supabase) never open a page and record nothing, which is correct.
    video: "on",
  },
  reporter: [["list"], ["html", { open: "never" }]],
});
