import { createContext, useContext, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
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

  useEffect(() => {
    // hidden_sections/reduce_motion are admin-only prefs, keyed by admin_id —
    // for a client, userProfile.id is their own id, which can never match an
    // admin_id, so this would always return zero rows. Skipping it for
    // clients removes a guaranteed-empty request from every page load.
    if (!userProfile?.id || !isAdmin) return;
    supabase
      .from("practice_settings")
      .select("hidden_sections, reduce_motion")
      .eq("admin_id", userProfile.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.hidden_sections) setHiddenSections(data.hidden_sections);
        if (data?.reduce_motion) applyMotion(true);
      });
  }, [userProfile?.id, isAdmin]);

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
