import { type ComponentType, type LazyExoticComponent, lazy } from "react";

import { showUpdatingSplash } from "./updatingSplash";

// Vite fingerprints every code-split chunk's filename. After a deploy the
// browser can still be holding the previous index.html, so an `import()` of a
// route chunk 404s — "Failed to fetch dynamically imported module
// .../SettingsPage-<oldhash>.js". That can't be recovered in place: the error
// bubbles to the ErrorBoundary and the route just dies until a manual refresh.
//
// The fix is to reload once so the browser fetches the fresh index.html (and
// with it the new chunk names). A sessionStorage guard stops a genuinely
// broken build — or an offline user — from getting stuck in a reload loop.

const RELOAD_FLAG = "chunk-reload-attempted";

function readFlag(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_FLAG) === "1";
  } catch {
    return false;
  }
}

function writeFlag(v: boolean): void {
  try {
    if (v) sessionStorage.setItem(RELOAD_FLAG, "1");
    else sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    /* private mode / storage disabled — best effort */
  }
}

const STALE_CHUNK = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  // wrong MIME (a 404 that fell through to index.html) — wording varies by browser
  /module script.*mime type/i,
  /mime type.*text\/html/i,
];

/**
 * Given an `import()` failure, decide whether to `"reload"` (looks like a
 * stale chunk after a deploy, and we haven't reloaded yet this session) or
 * `"rethrow"` (unrelated error, or we already reloaded once — don't loop).
 * Pure except for the sessionStorage guard flag; exported for tests.
 */
export function classifyImportError(err: unknown): "reload" | "rethrow" {
  const msg = err instanceof Error ? err.message : String(err);
  const isStale = STALE_CHUNK.some((re) => re.test(msg));
  return isStale && !readFlag() ? "reload" : "rethrow";
}

export function lazyWithReload<T extends ComponentType<Record<string, never>>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const mod = await factory();
      writeFlag(false); // loaded fine — let a *future* stale deploy reload again
      return mod;
    } catch (err) {
      if (classifyImportError(err) === "reload") {
        writeFlag(true);
        // Same "Updating…" sapling the UpdateBanner shows on a manual update,
        // so the deploy-triggered auto-reload isn't a silent white flash.
        showUpdatingSplash();
        window.location.reload();
        // Never resolve — React shouldn't flash the error boundary in the
        // moment before the reload takes hold.
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
}
