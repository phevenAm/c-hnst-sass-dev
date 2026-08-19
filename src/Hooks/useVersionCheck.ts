import { useEffect, useState } from "react";

declare const __APP_VERSION__: string;

export async function hardRefresh() {
  const reg = await navigator.serviceWorker?.getRegistration();
  await reg?.update();
  window.location.reload();
}

export function useVersionCheck() {
  const [isOutdated, setIsOutdated] = useState(false);

  // Fetch /version.json on mount + every tab focus (cache-busted).
  // version.json is regenerated from package.json on every build, so this
  // automatically detects new deployments with no manual steps.
  useEffect(() => {
    const check = () => {
      fetch(`/version.json?t=${Date.now()}`)
        .then((r) => r.json())
        .then((data: { version: string }) => {
          if (data.version !== __APP_VERSION__) setIsOutdated(true);
        })
        .catch(() => {});
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };

    check();
    document.addEventListener("visibilitychange", onVisible);
    // Installed PWAs don't reliably fire visibilitychange the way browser
    // tabs do (a standalone window can stay "visible" for a whole session),
    // so poll as a fallback rather than relying on focus events alone.
    const interval = setInterval(check, 5 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
    };
  }, []);

  return isOutdated;
}
