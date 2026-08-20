import { useEffect, useState } from "react";

import { applyServiceWorkerUpdate } from "@/lib/swUpdate";

declare const __APP_VERSION__: string;

export async function hardRefresh() {
  await applyServiceWorkerUpdate();
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
        if (data.version !== __APP_VERSION__) setIsOutdated(true);
      })
      .catch(() => {});
  }, []);

  return isOutdated;
}
