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

const WAIT_FOR_WORKER_MS = 8000;

// registration.update() (checkForServiceWorkerUpdate, called when
// useVersionCheck first detects a mismatch) only kicks off the fetch/install
// — it doesn't wait for it to finish. If "Update now" gets clicked before
// the new worker reaches the waiting state, updateSW() below has nothing to
// activate and silently no-ops: no reload, no error, and the banner just
// reappears on the next check — reading as the button "doing nothing" or
// the banner "persisting". This waits (bounded) for a worker to actually be
// ready, handling both an install already in flight and one that hasn't
// started yet.
function waitForWaitingWorker(timeoutMs = WAIT_FOR_WORKER_MS): Promise<boolean> {
  if (!registration) return Promise.resolve(false);
  if (registration.waiting) return Promise.resolve(true);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      registration?.removeEventListener("updatefound", onUpdateFound);
      resolve(result);
    };

    const watchInstalling = (worker: ServiceWorker) => {
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && registration?.waiting) finish(true);
        if (worker.state === "redundant") finish(false);
      });
    };

    const onUpdateFound = () => {
      if (registration?.installing) watchInstalling(registration.installing);
    };

    if (registration.installing) watchInstalling(registration.installing);
    registration.addEventListener("updatefound", onUpdateFound);
    const timer = setTimeout(() => finish(false), timeoutMs);
  });
}

// Tells the waiting service worker (installed via registerType: "prompt")
// to activate, then reloads once it's actually in control — the deliberate,
// one-step version of what registerType: "autoUpdate" used to do silently
// mid-session for every open tab.
export async function applyServiceWorkerUpdate() {
  if (updateSW && registration) {
    const ready = registration.waiting ? true : await waitForWaitingWorker();
    if (ready) {
      await updateSW(true);
      return;
    }
    // Timed out without a worker ever reaching "waiting" — nothing to
    // activate. A plain reload at least picks up a fresh index.html and
    // version.json rather than leaving the user stuck on a banner that
    // does nothing when they click it.
    window.location.reload();
    return;
  }
  // No SW registered yet (e.g. dev mode) — a plain reload is the correct fallback.
  window.location.reload();
}
