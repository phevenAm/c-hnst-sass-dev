// Whole-app link crawl: sign in, then breadth-first walk every in-app link
// reachable from the landing page and assert each destination renders without
// a 404, an error boundary, or a console/page error.
//
// NAVIGATION ONLY. The crawler follows <a href> / [role=link] targets with
// page.goto — it never clicks buttons or submits forms, so it is safe to run
// against the demo accounts on the shared DB (same accounts e2e/axe-scan uses).
//
// What counts as a failure for a visited route:
//   * the document response is >= 400
//   * the NotFoundPage rendered ("Page not found") for a link the app itself
//     produced (a real dead link)
//   * the ErrorBoundary rendered ("Oops, something went wrong")
//   * an uncaught page error, or a console.error, fired while it loaded
//
// Run:  npx playwright test e2e/crawl/no-404s.spec.ts
// Needs the dev server on :5174 and the demo accounts seeded.

import { expect, type Page, test } from "@playwright/test";

const BASE = "http://localhost:5174";
const MAX_ROUTES = 200;

const ADMIN = { email: "demo-admin@honest.com", password: "DemoAdmin2026", start: "/admin" };
const CLIENT = { email: "demo-client@honest.com", password: "DemoClient2026", start: "/dashboard" };

// Console noise that is not a real defect on any given route. @axe-core/react
// runs in the dev build and logs a11y findings to console.error on every page
// (there's a dedicated e2e/axe-scan.spec.ts for those) — the crawl also skips
// anything logged inside axe's console group, see `axeDepth` below.
const IGNORED_CONSOLE = [
  /Download the React DevTools/i,
  /\[vite\]/i,
  /Failed to load resource: the server responded with a status of 401/i, // opportunistic pre-auth fetches
  /ResizeObserver loop/i,
  /quotable\.io/i, // 3rd-party inspirational-quotes API, flaky, not ours
  /New axe issues/i,
  /Fix (any|all) of the following/i,
  /contained by landmarks/i,
  /must have sufficient color contrast/i,
];

// Routes we never enqueue (external, auth-destroying, or non-navigations).
function isCrawlable(href: string | null): href is string {
  if (!href) return false;
  if (href.startsWith("#")) return false;
  if (/^(mailto|tel|blob|data|javascript):/i.test(href)) return false;
  if (/^https?:\/\//i.test(href) && !href.startsWith(BASE)) return false;
  return true;
}

// Collapse volatile segments so /admin/clients/<uuid> is visited once.
function canonical(pathname: string): string {
  return (
    pathname
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi, "/:id")
      .replace(/\/\d+(?=\/|$)/g, "/:n")
      .replace(/\/+$/, "") || "/"
  );
}

const SKIP_PATHS = [
  /^\/logout$/,
  /^\/login$/,
  /^\/signup$/,
  /^\/register/,
  /^\/subscribe$/,
  /-callback$/, // OAuth return routes
  /^\/unsubscribe$/,
];

async function login(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15000 });
  // The demo onboarding modal can't be dismissed reliably in Playwright — strip
  // any dialog node so it never covers the page. Observe `document` (always a
  // Node; documentElement can still be null when this runs at document-start).
  await page.addInitScript(() => {
    const strip = () => {
      for (const n of document.querySelectorAll('[role="dialog"], [aria-modal="true"]')) n.remove();
    };
    document.addEventListener("DOMContentLoaded", strip);
    new MutationObserver(strip).observe(document, { childList: true, subtree: true });
  });
}

async function crawl(page: Page, start: string, label: string) {
  const queue: string[] = [canonical(start)];
  const seen = new Set<string>(queue);
  const failures: string[] = [];
  let visited = 0;

  while (queue.length && visited < MAX_ROUTES) {
    const route = queue.shift()!;
    if (SKIP_PATHS.some((re) => re.test(route))) continue;
    if (route.includes("/:id") || route.includes("/:n")) {
      // We can't goto a placeholder — record it as reached and move on.
      continue;
    }
    visited++;

    const consoleErrors: string[] = [];
    let axeDepth = 0; // console-group nesting inside @axe-core/react's report
    const onConsole = (msg: { type: () => string; text: () => string }) => {
      const type = msg.type();
      const text = msg.text();
      if (type === "startGroup" || type === "startGroupCollapsed") {
        if (axeDepth > 0 || /axe issues/i.test(text)) axeDepth++;
        return;
      }
      if (type === "endGroup") {
        if (axeDepth > 0) axeDepth--;
        return;
      }
      if (type !== "error" || axeDepth > 0) return;
      if (!IGNORED_CONSOLE.some((re) => re.test(text))) consoleErrors.push(text);
    };
    const pageErrors: string[] = [];
    const onPageError = (err: Error) => pageErrors.push(`${err.name}: ${err.message}`);
    page.on("console", onConsole);
    page.on("pageerror", onPageError);

    let status = 0;
    try {
      const res = await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 20000 });
      status = res?.status() ?? 0;
    } catch (e) {
      failures.push(`${route} — navigation threw: ${(e as Error).message}`);
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
      continue;
    }
    await page.waitForTimeout(300);

    const bodyText = await page
      .locator("body")
      .innerText()
      .catch(() => "");
    const is404 = /Page not found/i.test(bodyText);
    const isBoundary = /Oops, something went wrong/i.test(bodyText);

    if (status >= 400) failures.push(`${route} — HTTP ${status}`);
    if (is404) failures.push(`${route} — rendered NotFoundPage (dead in-app link)`);
    if (isBoundary) failures.push(`${route} — rendered ErrorBoundary`);
    if (pageErrors.length) failures.push(`${route} — page error: ${pageErrors.join(" | ")}`);
    if (consoleErrors.length) failures.push(`${route} — console.error: ${consoleErrors.slice(0, 3).join(" | ")}`);

    page.off("console", onConsole);
    page.off("pageerror", onPageError);

    // Enqueue newly-seen links, but don't expand from a broken page.
    if (!is404 && !isBoundary) {
      const hrefs = await page.$$eval("a[href], [role='link'][href]", (els) => els.map((e) => e.getAttribute("href")));
      for (const href of hrefs) {
        if (!isCrawlable(href)) continue;
        let pathname: string;
        try {
          pathname = new URL(href, BASE).pathname;
        } catch {
          continue;
        }
        if (!pathname.startsWith("/")) continue; // non-hierarchical URL slipped through
        const c = canonical(pathname);
        if (!seen.has(c)) {
          seen.add(c);
          queue.push(c);
        }
      }
    }
  }

  const summary = `${label}: visited ${visited} route(s), ${seen.size} discovered.\n` + [...seen].sort().join("\n");
  test.info().attach(`${label}-routes.txt`, { body: summary, contentType: "text/plain" });

  expect(failures, `\n${failures.join("\n")}\n`).toEqual([]);
}

test.describe.configure({ mode: "serial", timeout: 300_000 });

test("no broken routes — admin", async ({ browser }) => {
  const page = await browser.newPage();
  await login(page, ADMIN.email, ADMIN.password);
  await crawl(page, ADMIN.start, "admin");
  await page.close();
});

test("no broken routes — client", async ({ browser }) => {
  const page = await browser.newPage();
  await login(page, CLIENT.email, CLIENT.password);
  await crawl(page, CLIENT.start, "client");
  await page.close();
});
