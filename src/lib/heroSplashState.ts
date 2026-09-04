// Reader side of the boot splash's readiness signal. The splash itself is no
// longer a React component — it's app.html's #boot-splash, animated by the
// standalone /src/bootSplash.ts script (so it doesn't wait behind the main
// app bundle). That script is the one true owner: it sets
// `window.__heroSplashDone = true` and fires "clarity:splash-done" once it
// removes itself. Every "loading" gate in Router.tsx (via <AuthLoadingState>)
// reads this instead of rendering its own splash, so only one splash is ever
// on screen — see AuthLoadingState.tsx.
export function isHeroSplashDone(): boolean {
  return typeof window !== "undefined" && window.__heroSplashDone === true;
}

export function subscribeHeroSplashDone(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("clarity:splash-done", cb);
  return () => window.removeEventListener("clarity:splash-done", cb);
}
