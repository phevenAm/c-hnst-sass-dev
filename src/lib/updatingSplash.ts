// Shows the hero sapling splash with an "Updating…" caption over the whole
// app, for the moment between "Update now" being clicked and the reload that
// hardRefresh() triggers. It's plain DOM (not React) on purpose: it needs to
// paint instantly and survive right up to navigation, and the real
// #boot-splash in app.html takes over on the next load anyway.
//
// The SVG is app.html's #boot-splash-mark verbatim (self-animating SMIL).
// Regenerate both from "src/LOGO Asset/sapling animated.svg" if it changes.
const SAPLING_SVG = `<svg fill="none" height="100%" width="100%" viewBox="0 0 96 96" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns="http://www.w3.org/2000/svg"><g transform="matrix(4,0,0,4,0,0)" display="none" id="u0"><animate repeatCount="indefinite" begin="0s" calcMode="discrete" dur="5s" values="none; inline; inline" keyTimes="0; 0.105682; 1" attributeName="display" /><g id="u1"><path stroke-dasharray="0 100" pathLength="100" stroke-linejoin="round" stroke-linecap="round" stroke-width="2" stroke="#184030" fill="#184030" fill-opacity="0" d="M12,12C12,7,17,3,22,3C22,8,18,12,12,12C12,12,12,12,12,12Z"><animate repeatCount="indefinite" attributeName="fill-opacity" dur="5s" begin="0s" fill="freeze" values="0; 0; 0; 0.88; 0.88" keyTimes="0; 0.242424; 0.280303; 0.318182; 1" keySplines="0 0 1 1; 0 0 1 1; 0 0 1 1; 0 0 1 1" calcMode="spline" /><animate repeatCount="indefinite" fill="freeze" begin="0s" dur="5s" calcMode="spline" keySplines="0 0 1 1; 0 0 1 1; 0 0 1 1" keyTimes="0; 0.022727; 0.303031; 1" values="0 100; 0 100; 100 0; 100 0" attributeName="stroke-dasharray" /><animate repeatCount="indefinite" fill="freeze" begin="0s" dur="5s" calcMode="spline" keySplines="0 0 1 1; 0 0 1 1; 0 0 1 1" keyTimes="0; 0.022727; 0.303031; 1" values="0; 0; 0; 0" attributeName="stroke-dashoffset" /></path></g></g><g transform="matrix(4,0,0,4,0,0)" id="u2"><g id="u3"><path stroke-dasharray="0 100" pathLength="100" stroke-linejoin="round" stroke-linecap="round" stroke-width="2" stroke="#2c4f41" d="M12,22C12,22,12,12,12,12"><animate repeatCount="indefinite" fill="freeze" begin="0s" dur="5s" calcMode="spline" keySplines="0.37 0 0 1; 0.37 0 0 1; 0 0 1 1" keyTimes="0; 0; 0.015151; 1" values="0 100; 98.719 1.281; 98.99 1.01; 98.99 1.01" attributeName="stroke-dasharray" /><animate repeatCount="indefinite" fill="freeze" begin="0s" dur="5s" calcMode="spline" keySplines="0.37 0 0 1; 0.37 0 0 1; 0 0 1 1" keyTimes="0; 0; 0.015151; 1" values="0; 0; 0; 0" attributeName="stroke-dashoffset" /></path></g></g><g transform="matrix(4,0,0,4,0,0)" display="none" id="u4"><animate repeatCount="indefinite" begin="0s" calcMode="discrete" dur="5s" values="none; inline; inline" keyTimes="0; 0; 1" attributeName="display" /><g id="u5"><path stroke-dasharray="0 100" pathLength="100" stroke-linejoin="round" stroke-linecap="round" stroke-width="2" stroke="#2c4f41" d="M12,12C12,7,7,3,2,3C2,8,6,12,12,12C12,12,12,12,12,12Z"><animate repeatCount="indefinite" fill="freeze" begin="0s" dur="5s" calcMode="spline" keySplines="0 0 1 1; 0.76 0 0.24 1; 0 0 1 1" keyTimes="0; 0; 0.113636; 1" values="0 100; 0 100; 100 0; 100 0" attributeName="stroke-dasharray" /><animate repeatCount="indefinite" fill="freeze" begin="0s" dur="5s" calcMode="spline" keySplines="0 0 1 1; 0.76 0 0.24 1; 0 0 1 1" keyTimes="0; 0; 0.113636; 1" values="0; 0; 0; 0" attributeName="stroke-dashoffset" /></path></g></g></svg>`;

export function showUpdatingSplash(): void {
  if (typeof document === "undefined" || document.getElementById("updating-splash")) return;

  const dark = document.documentElement.classList.contains("dark");
  const bg = dark ? "#162622" : "#f3f1ea";
  const caption = dark ? "#8fb5ad" : "#2d7264";

  const el = document.createElement("div");
  el.id = "updating-splash";
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.style.cssText = `position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:${bg};`;
  el.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:18px;">
    <div style="width:96px;height:96px;">${SAPLING_SVG}</div>
    <p style="margin:0;font:600 15px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;letter-spacing:0.02em;color:${caption};">Updating…</p>
  </div>`;
  document.body.appendChild(el);

  const reduced =
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    (() => {
      try {
        return localStorage.getItem("app_reduce_motion") === "1";
      } catch {
        return false;
      }
    })();
  if (reduced) {
    const svg = el.querySelector("svg") as
      | (SVGSVGElement & { pauseAnimations?: () => void; setCurrentTime?: (t: number) => void })
      | null;
    try {
      svg?.setCurrentTime?.(4.5);
      svg?.pauseAnimations?.();
    } catch {
      /* SMIL control unsupported — it just keeps looping */
    }
  }
}
