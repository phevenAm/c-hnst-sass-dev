import { createContext, useContext, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import { useAppSelector, useFetchOnIdle } from "@/store/hooks";
import { fetchPracticeSettings } from "@/store/slices/practiceSettingsSlice";
import { useAuth } from "./AuthContext";

// Zoom is a per-device display preference ("how do I like my own screen to
// look right now"), not a practice-wide workspace setting like
// hidden_sections/reduce_motion below — it doesn't need to sync across an
// admin's other devices or be visible to anyone else, so it lives in
// localStorage rather than practice_settings, and applies for both roles
// (clients never load the DB-backed prefs above at all).
export const APP_ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5] as const;
export type AppZoom = (typeof APP_ZOOM_LEVELS)[number];
const APP_ZOOM_STORAGE_KEY = "app_zoom";
// Clients have no practice_settings row, so their reduce-motion preference
// also lives in localStorage (same rationale as zoom above). Admins keep
// using the DB-backed practice_settings.reduce_motion so it syncs across
// their devices.
const REDUCE_MOTION_STORAGE_KEY = "app_reduce_motion";

function readStoredZoom(): AppZoom {
  try {
    const raw = Number(window.localStorage.getItem(APP_ZOOM_STORAGE_KEY));
    return (APP_ZOOM_LEVELS as readonly number[]).includes(raw) ? (raw as AppZoom) : 1;
  } catch {
    return 1;
  }
}

function readStoredReduceMotion(): boolean {
  try {
    return window.localStorage.getItem(REDUCE_MOTION_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

type InterfacePrefsContextValue = {
  hiddenSections: string[];
  toggleSection: (id: string) => Promise<void>;
  reduceMotion: boolean;
  setReduceMotion: (v: boolean) => Promise<void>;
  appZoom: AppZoom;
  setAppZoom: (v: AppZoom) => void;
};

const InterfacePrefsContext = createContext<InterfacePrefsContextValue>({
  hiddenSections: [],
  toggleSection: async () => {},
  reduceMotion: false,
  setReduceMotion: async () => {},
  appZoom: 1,
  setAppZoom: () => {},
});

export function InterfacePrefsProvider({ children }: { children: React.ReactNode }) {
  const { userProfile, isAdmin } = useAuth();
  const [hiddenSections, setHiddenSections] = useState<string[]>([]);
  const [reduceMotion, setReduceMotionState] = useState(false);
  const [appZoom, setAppZoomState] = useState<AppZoom>(1);

  // Applies immediately on mount, for both roles, independent of auth/admin
  // status resolving — a display preference shouldn't wait on a network
  // round trip.
  useEffect(() => {
    const stored = readStoredZoom();
    setAppZoomState(stored);
    document.documentElement.style.setProperty("--app-zoom", String(stored));
  }, []);

  // Clients: apply the localStorage reduce-motion preference once we know the
  // role isn't admin. Admins get theirs from cachedPrefs below instead.
  // biome-ignore lint/correctness/useExhaustiveDependencies: applyMotion is a stable per-render closure, not a changing dependency
  useEffect(() => {
    if (isAdmin) return;
    applyMotion(readStoredReduceMotion());
  }, [isAdmin]);

  // hidden_sections/reduce_motion are admin-only prefs — for clients this
  // stays untriggered (no reason to even hold the shared fetch open for
  // them here; Navbar/etc. already trigger it where they need it).
  useFetchOnIdle(
    (state) => state.practiceSettings.status,
    isAdmin ? fetchPracticeSettings : null,
    "Failed to load practice settings",
  );
  const cachedPrefs = useAppSelector((state) => state.practiceSettings.data);

  // biome-ignore lint/correctness/useExhaustiveDependencies: applyMotion is a stable per-render closure, not a changing dependency
  useEffect(() => {
    if (!isAdmin || !cachedPrefs) return;
    if (cachedPrefs.hidden_sections) setHiddenSections(cachedPrefs.hidden_sections);
    // Always resolve, not just when true — otherwise an admin who turns
    // reduce-motion back off never gets applyMotion(false) called, leaving
    // both the DOM class and the boot-splash's localStorage cache stale.
    applyMotion(!!cachedPrefs.reduce_motion);
  }, [isAdmin, cachedPrefs]);

  const applyMotion = (reduce: boolean) => {
    setReduceMotionState(reduce);
    document.documentElement.classList.toggle("no-motion", reduce);
    // Admins' real preference lives in practice_settings (DB), not
    // localStorage — but /src/bootSplash.ts runs before React/Supabase have
    // even loaded, so it can't wait on that fetch. Mirroring the resolved
    // value here (every time it's determined, for both roles) gives it a
    // synchronously-readable cache: possibly one page load stale right after
    // the setting changes on another device, corrected the moment this
    // effect runs again.
    try {
      window.localStorage.setItem(REDUCE_MOTION_STORAGE_KEY, reduce ? "1" : "0");
    } catch {
      // private mode / storage disabled — motion still applies for this load
    }
  };

  const toggleSection = async (id: string) => {
    if (!userProfile?.id) return;
    const next = hiddenSections.includes(id) ? hiddenSections.filter((s) => s !== id) : [...hiddenSections, id];
    setHiddenSections(next);
    await supabase.from("practice_settings").update({ hidden_sections: next }).eq("admin_id", userProfile.id);
  };

  const setReduceMotion = async (v: boolean) => {
    // applyMotion already mirrors to localStorage for both roles.
    applyMotion(v);
    if (!isAdmin) return;
    if (!userProfile?.id) return;
    await supabase.from("practice_settings").update({ reduce_motion: v }).eq("admin_id", userProfile.id);
  };

  const setAppZoom = (v: AppZoom) => {
    setAppZoomState(v);
    document.documentElement.style.setProperty("--app-zoom", String(v));
    try {
      window.localStorage.setItem(APP_ZOOM_STORAGE_KEY, String(v));
    } catch {
      // private mode / storage disabled — zoom still applies for this load, just won't persist
    }
  };

  return (
    <InterfacePrefsContext.Provider
      value={{ hiddenSections, toggleSection, reduceMotion, setReduceMotion, appZoom, setAppZoom }}
    >
      {children}
    </InterfacePrefsContext.Provider>
  );
}

export const useInterfacePrefs = () => useContext(InterfacePrefsContext);
