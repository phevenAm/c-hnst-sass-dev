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

function readStoredZoom(): AppZoom {
  try {
    const raw = Number(window.localStorage.getItem(APP_ZOOM_STORAGE_KEY));
    return (APP_ZOOM_LEVELS as readonly number[]).includes(raw) ? (raw as AppZoom) : 1;
  } catch {
    return 1;
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
    if (cachedPrefs.reduce_motion) applyMotion(true);
  }, [isAdmin, cachedPrefs]);

  const applyMotion = (reduce: boolean) => {
    setReduceMotionState(reduce);
    document.documentElement.classList.toggle("no-motion", reduce);
  };

  const toggleSection = async (id: string) => {
    if (!userProfile?.id) return;
    const next = hiddenSections.includes(id) ? hiddenSections.filter((s) => s !== id) : [...hiddenSections, id];
    setHiddenSections(next);
    await supabase.from("practice_settings").update({ hidden_sections: next }).eq("admin_id", userProfile.id);
  };

  const setReduceMotion = async (v: boolean) => {
    if (!userProfile?.id) return;
    applyMotion(v);
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
