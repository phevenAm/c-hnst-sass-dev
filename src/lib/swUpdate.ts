// Bridges index.tsx's registerSW() call (module-scope, runs once at boot)
// to UpdateBanner/hardRefresh, which need to trigger that same update later
// without a circular import on the app's entry point.
type UpdateFn = (reloadPage?: boolean) => Promise<void>;

let updateSW: UpdateFn | null = null;
let registration: ServiceWorkerRegistration | null = null;

export function setUpdateSW(fn: UpdateFn) {
  updateSW = fn;
}

export function setSwRegistration(reg: ServiceWorkerRegistration) {
  registration = reg;
}

// Browsers only auto-check a service worker for updates on navigation to a
// page in its scope — a PWA left open as a single long-lived tab may never
// trigger that, so registerSW()'s "waiting" worker can still be null even
// after a new version has deployed. Clicking "Update now" against a
// registration with nothing waiting just no-ops: no error, no reload, the
// banner reappears next check — which reads as the button "doing nothing"
// or "persisting". Forcing a check here, right before the button is even
// shown (see useVersionCheck), gives the new worker time to install so
// there's actually something for updateSW() to activate.
export function checkForServiceWorkerUpdate() {
  registration?.update().catch(() => {});
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
