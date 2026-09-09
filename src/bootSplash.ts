// Coordinates the hero splash animation with the rest of the app — the
// animation itself needs no JS at all: app.html inlines
// "src/LOGO Asset/sapling animated.svg" verbatim (self-animating via SMIL
// <animate>), so it's playing the instant the browser has the HTML, before
// this script (or the ~1 MB main app bundle) has even downloaded.
//
// What this script actually does:
//   - reduced motion (OS setting or the app's own "Stop animations" toggle):
//     freezes the SVG on a held frame instead of letting it play.
//   - otherwise: leaves it running (it loops on its own, 5s per cycle) and
//     just times when "one cycle" counts as done.
//   - either way, fades #boot-splash out and removes it once that's true AND
//     the app (Router.tsx, via the "clarity:auth-ready" window event) reports
//     auth is ready — whichever finishes last. See heroSplashState.ts for how
//     the rest of the app defers to this instead of each showing its own
//     splash while loading.
//
// It also exports showSplash(text?): re-paints the same sapling splash over
// the running app on demand, with an optional caption ("Loading…", …). Used
// by lazyWithReload for the moment between a stale-chunk import failure and
// the reload that recovers it — app.html's inline #boot-splash then takes
// over on the next load.
declare global {
  interface Window {
    __authReady?: boolean;
    __heroSplashDone?: boolean;
    __message?: string | null;
    __bootSplashInit?: boolean;
  }
}

// Short cross-fade out into the app underneath, rather than a hard cut — by
// the time this runs the app has rendered (auth is ready), so it's fading to
// real content, not a blank frame.
const FADE_MS = 300;
// The mark starts fading in at ~1.4s (900ms delay + 500ms fade, app.html)
// and the SMIL grow-in settles ~2s in — later still if bundle-parse jank
// held its clock. Hold past that so the finished sapling is clearly visible
// before the splash goes, with headroom for a slow first paint — still well
// short of the 5s loop wrap where it snaps back to the start. finish() also
// waits on "clarity:auth-ready", so real loads are usually longer than this.
const ONE_CYCLE_MS = 3600;
// Frozen frame for reduced motion: past all growth (~1.6s in), short of the
// 5s loop boundary where behaviour at the exact wrap point is unreliable.
const HELD_FRAME_S = 4.5;

// app.html's #boot-splash-mark SVG, verbatim, for the showSplash() re-paint
// (by then the original node has been removed). Self-animating SMIL — no
// JS/fetch/library. Regenerate both from "src/LOGO Asset/sapling animated.svg"
// if it changes.
const SAPLING_SVG = `<svg fill="none" height="100%" width="100%" viewBox="0 0 96 96" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns="http://www.w3.org/2000/svg"><g transform="matrix(4,0,0,4,0,0)" display="none" id="u0"><animate repeatCount="indefinite" begin="0s" calcMode="discrete" dur="5s" values="none; inline; inline" keyTimes="0; 0.105682; 1" attributeName="display" /><g id="u1"><path stroke-dasharray="0 100" pathLength="100" stroke-linejoin="round" stroke-linecap="round" stroke-width="2" stroke="#184030" fill="#184030" fill-opacity="0" d="M12,12C12,7,17,3,22,3C22,8,18,12,12,12C12,12,12,12,12,12Z"><animate repeatCount="indefinite" attributeName="fill-opacity" dur="5s" begin="0s" fill="freeze" values="0; 0; 0; 0.88; 0.88" keyTimes="0; 0.242424; 0.280303; 0.318182; 1" keySplines="0 0 1 1; 0 0 1 1; 0 0 1 1; 0 0 1 1" calcMode="spline" /><animate repeatCount="indefinite" fill="freeze" begin="0s" dur="5s" calcMode="spline" keySplines="0 0 1 1; 0 0 1 1; 0 0 1 1" keyTimes="0; 0.022727; 0.303031; 1" values="0 100; 0 100; 100 0; 100 0" attributeName="stroke-dasharray" /><animate repeatCount="indefinite" fill="freeze" begin="0s" dur="5s" calcMode="spline" keySplines="0 0 1 1; 0 0 1 1; 0 0 1 1" keyTimes="0; 0.022727; 0.303031; 1" values="0; 0; 0; 0" attributeName="stroke-dashoffset" /></path></g></g><g transform="matrix(4,0,0,4,0,0)" id="u2"><g id="u3"><path stroke-dasharray="0 100" pathLength="100" stroke-linejoin="round" stroke-linecap="round" stroke-width="2" stroke="#2c4f41" d="M12,22C12,22,12,12,12,12"><animate repeatCount="indefinite" fill="freeze" begin="0s" dur="5s" calcMode="spline" keySplines="0.37 0 0 1; 0.37 0 0 1; 0 0 1 1" keyTimes="0; 0; 0.015151; 1" values="0 100; 98.719 1.281; 98.99 1.01; 98.99 1.01" attributeName="stroke-dasharray" /><animate repeatCount="indefinite" fill="freeze" begin="0s" dur="5s" calcMode="spline" keySplines="0.37 0 0 1; 0.37 0 0 1; 0 0 1 1" keyTimes="0; 0; 0.015151; 1" values="0; 0; 0; 0" attributeName="stroke-dashoffset" /></path></g></g><g transform="matrix(4,0,0,4,0,0)" display="none" id="u4"><animate repeatCount="indefinite" begin="0s" calcMode="discrete" dur="5s" values="none; inline; inline" keyTimes="0; 0; 1" attributeName="display" /><g id="u5"><path stroke-dasharray="0 100" pathLength="100" stroke-linejoin="round" stroke-linecap="round" stroke-width="2" stroke="#2c4f41" d="M12,12C12,7,7,3,2,3C2,8,6,12,12,12C12,12,12,12,12,12Z"><animate repeatCount="indefinite" fill="freeze" begin="0s" dur="5s" calcMode="spline" keySplines="0 0 1 1; 0.76 0 0.24 1; 0 0 1 1" keyTimes="0; 0; 0.113636; 1" values="0 100; 0 100; 100 0; 100 0" attributeName="stroke-dasharray" /><animate repeatCount="indefinite" fill="freeze" begin="0s" dur="5s" calcMode="spline" keySplines="0 0 1 1; 0.76 0 0.24 1; 0 0 1 1" keyTimes="0; 0; 0.113636; 1" values="0; 0; 0; 0" attributeName="stroke-dashoffset" /></path></g></g></svg>`;

function prefersReducedMotion(): boolean {
  let appToggle = false;
  try {
    appToggle = window.localStorage.getItem("app_reduce_motion") === "1";
  } catch {
    // private mode / storage disabled — OS setting still applies
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches || appToggle;
}

function freezeSapling(svg: SVGSVGElement | null): void {
  const el = svg as unknown as
    | (SVGSVGElement & { pauseAnimations?: () => void; setCurrentTime?: (t: number) => void })
    | null;
  try {
    el?.setCurrentTime?.(HELD_FRAME_S);
    el?.pauseAnimations?.();
  } catch {
    // SMIL control unsupported — the SVG just keeps looping, which is a
    // motion-preference miss but not a broken splash.
  }
}

function captionColor(): string {
  return document.documentElement.classList.contains("dark") ? "#8fb5ad" : "#2d7264";
}

function setCaption(root: HTMLElement, text: string): void {
  let p = root.querySelector<HTMLParagraphElement>("#boot-splash-caption");
  if (!p) {
    p = document.createElement("p");
    p.id = "boot-splash-caption";
    p.style.cssText =
      "margin:0;font:600 15px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;" +
      `letter-spacing:0.02em;color:${captionColor()};`;
    root.appendChild(p);
  }
  p.textContent = text;
}

// Paints the hero sapling splash over the whole app, with an optional
// caption. Plain DOM (not React) on purpose: it has to paint instantly and
// survive right up to a navigation. No-ops in SSR. If app.html's cold-load
// #boot-splash is somehow still up, this just captions it rather than
// stacking a second copy.
export function showSplash(text?: string): void {
  if (typeof document === "undefined") return;

  const existing = document.getElementById("boot-splash");
  if (existing) {
    if (text) setCaption(existing, text);
    return;
  }

  const dark = document.documentElement.classList.contains("dark");
  const bg = dark ? "#162622" : "#f3f1ea";

  const root = document.createElement("div");
  root.id = "boot-splash";
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "polite");
  // z-index matches app.html's #boot-splash — above every in-app layer.
  root.style.cssText =
    "position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;" +
    `align-items:center;justify-content:center;gap:18px;background:${bg};`;

  const mark = document.createElement("div");
  mark.style.cssText = "width:96px;height:96px;";
  mark.innerHTML = SAPLING_SVG;
  root.appendChild(mark);

  if (text) setCaption(root, text);

  document.body.appendChild(root);

  if (prefersReducedMotion()) freezeSapling(root.querySelector("svg"));
}

function boot() {
  const root = document.getElementById("boot-splash");
  const mark = document.getElementById("boot-splash-mark");
  const svg = mark?.querySelector("svg");
  if (!root || !mark || !svg) return;

  const reducedMotion = prefersReducedMotion();
  let animDone = false;
  let authReady = !!window.__authReady;
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    root.style.transition = `opacity ${FADE_MS}ms ease`;
    root.style.opacity = "0";
    root.style.pointerEvents = "none";
    window.setTimeout(() => {
      root.remove();
      window.__heroSplashDone = true;
      window.dispatchEvent(new Event("clarity:splash-done"));
    }, FADE_MS);
  };

  const maybeFinish = () => {
    if (animDone && authReady) finish();
  };

  window.addEventListener("clarity:auth-ready", () => {
    authReady = true;
    maybeFinish();
  });

  if (reducedMotion) {
    // The CSS fade-in keys off prefers-reduced-motion only; the app's own
    // "Stop animations" toggle is JS-only, so cancel the fade here too.
    mark.style.animation = "none";
    mark.style.opacity = "1";
    freezeSapling(svg as unknown as SVGSVGElement);
    animDone = true;
    maybeFinish();
    return;
  }

  window.setTimeout(() => {
    animDone = true;
    maybeFinish();
  }, ONE_CYCLE_MS);
}

// Guard against a double boot() if this module is ever evaluated twice (its
// own <script> tag in app.html plus an app-bundle import of showSplash).
if (typeof window !== "undefined" && !window.__bootSplashInit) {
  window.__bootSplashInit = true;
  boot();
}
