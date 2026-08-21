import { createContext, useContext, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import { useAppSelector, useFetchOnIdle } from "@/store/hooks";
import { fetchPracticeSettings } from "@/store/slices/practiceSettingsSlice";
import { useAuth } from "./AuthContext";

type InterfacePrefsContextValue = {
  hiddenSections: string[];
  toggleSection: (id: string) => Promise<void>;
  reduceMotion: boolean;
  setReduceMotion: (v: boolean) => Promise<void>;
};

const InterfacePrefsContext = createContext<InterfacePrefsContextValue>({
  hiddenSections: [],
  toggleSection: async () => {},
  reduceMotion: false,
  setReduceMotion: async () => {},
});

export function InterfacePrefsProvider({ children }: { children: React.ReactNode }) {
  const { userProfile, isAdmin } = useAuth();
  const [hiddenSections, setHiddenSections] = useState<string[]>([]);
  const [reduceMotion, setReduceMotionState] = useState(false);

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

  return (
    <InterfacePrefsContext.Provider value={{ hiddenSections, toggleSection, reduceMotion, setReduceMotion }}>
      {children}
    </InterfacePrefsContext.Provider>
  );
}

export const useInterfacePrefs = () => useContext(InterfacePrefsContext);
