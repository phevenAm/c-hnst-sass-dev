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
declare global {
  interface Window {
    __authReady?: boolean;
    __heroSplashDone?: boolean;
  }
}

const FADE_MS = 480;
// "sapling animated.svg"'s keyTimes were rescaled so it starts moving
// immediately instead of opening on ~0.6s of a static dot before the stem/
// leaves visibly moved. Growth now finishes by ~32% of the 5s loop (~1.6s);
// give it a little past that so the held pose is clearly visible before
// fading.
const ONE_CYCLE_MS = 2200;
// Frozen frame for reduced motion: past all growth (~1.6s in), short of the
// 5s loop boundary where behaviour at the exact wrap point is unreliable.
const HELD_FRAME_S = 4.5;

function boot() {
  const root = document.getElementById("boot-splash");
  const mark = document.getElementById("boot-splash-mark");
  const svg = mark?.querySelector("svg");
  if (!root || !mark || !svg) return;

  let appReducedMotion = false;
  try {
    appReducedMotion = window.localStorage.getItem("app_reduce_motion") === "1";
  } catch {
    // private mode / storage disabled — OS setting still applies
  }
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches || appReducedMotion;
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

  const svgEl = svg as unknown as SVGSVGElement & {
    pauseAnimations?: () => void;
    setCurrentTime?: (t: number) => void;
  };

  if (reducedMotion) {
    try {
      svgEl.setCurrentTime?.(HELD_FRAME_S);
      svgEl.pauseAnimations?.();
    } catch {
      // SMIL control unsupported — the SVG just keeps looping, which is a
      // motion-preference miss but not a broken splash.
    }
    // The CSS fade-in (app.html, #boot-splash-mark) has its own
    // prefers-reduced-motion media query for the OS setting, but can't see
    // the app's own "Stop animations" toggle — cancel it here so that case
    // is instant too, not stuck invisible for the fade's 1s delay.
    mark.style.animation = "none";
    mark.style.opacity = "1";
    animDone = true;
    maybeFinish();
    return;
  }

  window.setTimeout(() => {
    animDone = true;
    maybeFinish();
  }, ONE_CYCLE_MS);
}

boot();
