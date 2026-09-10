import { useEffect, useState } from "react";

import { showSplash } from "@/bootSplash";

import { applyServiceWorkerUpdate, checkForServiceWorkerUpdate } from "@/lib/swUpdate";

declare const __APP_VERSION__: string;

let refreshInFlight = false;

export async function hardRefresh() {
  // Spam-clicking "Force app update" / "Update now" used to fire this once per
  // click — each spawning its own registration.update() + bounded wait +
  // fallback navigation, racing each other. Collapse repeats into the first
  // run; it always ends in a navigation, so the guard only ever resets if
  // that navigation somehow didn't happen.
  if (refreshInFlight) return;
  refreshInFlight = true;

  // Cover the app with the sapling + "Updating…" for every caller — the
  // UpdateBanner "Update now" button and the Settings "Force app update"
  // button alike — not just whichever one remembered to call showSplash.
  showSplash("Updating…");
  // When a service worker is already waiting, applyServiceWorkerUpdate()
  // reloads almost immediately; hold the splash on screen long enough to
  // actually read before the navigation yanks it.
  await new Promise((resolve) => setTimeout(resolve, 450));
  try {
    await applyServiceWorkerUpdate();
  } finally {
    refreshInFlight = false;
  }
}

// Was polling /version.json every 5 min + on every tab focus, and was fully
// disabled 2026-08-20 while chasing a mid-session production slowdown
// (suspected, never confirmed, contributing factor). Restored as a single
// check on mount only — one fetch when the app instance opens, no interval,
// no focus listener — so UpdateBanner can still surface a real update
// without repeat firing during a session.
export function useVersionCheck() {
  const [isOutdated, setIsOutdated] = useState(false);

  useEffect(() => {
    fetch(`/version.json?t=${Date.now()}`)
      .then((r) => r.json())
      .then((data: { version: string }) => {
        if (data.version !== __APP_VERSION__) {
          setIsOutdated(true);
          // Get the real service worker installing now, not just the banner —
          // otherwise "Update now" has nothing waiting to activate yet.
          checkForServiceWorkerUpdate();
        }
      })
      .catch(() => {});
  }, []);

  return isOutdated;
}
