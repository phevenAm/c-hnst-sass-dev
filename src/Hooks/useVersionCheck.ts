import { useEffect, useState } from "react";

import { supabase } from "@lib/supabase";

declare const __APP_VERSION__: string;

export async function hardRefresh() {
  const reg = await navigator.serviceWorker?.getRegistration();
  await reg?.update();
  window.location.reload();
}

async function checkDbVersion(setIsOutdated: (v: boolean) => void) {
  const { data } = await supabase.from("system_config").select("value").eq("key", "app_version").maybeSingle();
  if (data?.value && data.value !== __APP_VERSION__) setIsOutdated(true);
}

export function useVersionCheck() {
  const [isOutdated, setIsOutdated] = useState(false);

  // Existing check: poll version.json on mount + tab focus
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
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // DB check: fires when a session becomes active (sign-in or already-signed-in
  // page load). If the DB app_version differs from the build constant, the PWA
  // update banner appears immediately — no tab-switch needed.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) checkDbVersion(setIsOutdated);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") checkDbVersion(setIsOutdated);
    });

    return () => subscription.unsubscribe();
  }, []);

  return isOutdated;
}
