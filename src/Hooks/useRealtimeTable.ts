import { useEffect } from "react";

import { supabase } from "@/lib/supabase.js";

export function useRealtimeTable(table: string, filter: string | undefined, callback: () => void) {
  useEffect(() => {
    if (!filter) return;
    const channel = supabase
      .channel(`realtime:${table}:${filter}`)
      .on("postgres_changes", { event: "*", schema: "public", table, filter }, callback)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, filter, callback]);
}
