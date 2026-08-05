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
  const { userProfile } = useAuth();
  const [hiddenSections, setHiddenSections] = useState<string[]>([]);
  const [reduceMotion, setReduceMotionState] = useState(false);

  useEffect(() => {
    if (!userProfile?.id) return;
    supabase
      .from("practice_settings")
      .select("hidden_sections, reduce_motion")
      .eq("admin_id", userProfile.id)
      .single()
      .then(({ data }) => {
        if (data?.hidden_sections) setHiddenSections(data.hidden_sections);
        if (data?.reduce_motion) applyMotion(true);
      });
  }, [userProfile?.id]);

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
