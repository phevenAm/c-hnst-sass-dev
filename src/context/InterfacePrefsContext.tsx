import { createContext, useContext, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthContext";

type InterfacePrefsContextValue = {
  hiddenSections: string[];
  toggleSection: (id: string) => Promise<void>;
};

const InterfacePrefsContext = createContext<InterfacePrefsContextValue>({
  hiddenSections: [],
  toggleSection: async () => {},
});

export function InterfacePrefsProvider({ children }: { children: React.ReactNode }) {
  const { userProfile } = useAuth();
  const [hiddenSections, setHiddenSections] = useState<string[]>([]);

  useEffect(() => {
    if (!userProfile?.id) return;
    supabase
      .from("practice_settings")
      .select("hidden_sections")
      .eq("admin_id", userProfile.id)
      .single()
      .then(({ data }) => {
        if (data?.hidden_sections) setHiddenSections(data.hidden_sections);
      });
  }, [userProfile?.id]);

  const toggleSection = async (id: string) => {
    if (!userProfile?.id) return;
    const next = hiddenSections.includes(id) ? hiddenSections.filter((s) => s !== id) : [...hiddenSections, id];
    setHiddenSections(next);
    await supabase.from("practice_settings").update({ hidden_sections: next }).eq("admin_id", userProfile.id);
  };

  return (
    <InterfacePrefsContext.Provider value={{ hiddenSections, toggleSection }}>
      {children}
    </InterfacePrefsContext.Provider>
  );
}

export const useInterfacePrefs = () => useContext(InterfacePrefsContext);
