import { applyServiceWorkerUpdate } from "@/lib/swUpdate";

export async function hardRefresh() {
  await applyServiceWorkerUpdate();
}

// Disabled 2026-08-20 at Stephen's request while chasing the mid-session
// production slowdown — this polled /version.json every 5 min + on every
// tab focus and drove UpdateBanner. Suspected (not confirmed) as a
// contributing factor. UpdateBanner now never shows since isOutdated is
// permanently false; hardRefresh()/applyServiceWorkerUpdate() are untouched
// and still work if triggered another way.
export function useVersionCheck() {
  return false;
}
