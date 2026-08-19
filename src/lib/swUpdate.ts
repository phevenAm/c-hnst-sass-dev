// Bridges index.tsx's registerSW() call (module-scope, runs once at boot)
// to UpdateBanner/hardRefresh, which need to trigger that same update later
// without a circular import on the app's entry point.
type UpdateFn = (reloadPage?: boolean) => Promise<void>;

let updateSW: UpdateFn | null = null;

export function setUpdateSW(fn: UpdateFn) {
  updateSW = fn;
}

// Tells the waiting service worker (installed via registerType: "prompt")
// to activate, then reloads once it's actually in control — the deliberate,
// one-step version of what registerType: "autoUpdate" used to do silently
// mid-session for every open tab.
export async function applyServiceWorkerUpdate() {
  if (updateSW) {
    await updateSW(true);
    return;
  }
  // No SW registered yet (e.g. dev mode) — a plain reload is the correct fallback.
  window.location.reload();
}
