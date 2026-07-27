import { useEffect, useRef } from "react";

import { supabase } from "@/lib/supabase.js";

export function useRealtimeTable(table: string, filter: string | undefined, callback: () => void) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!filter) return;
    const channel = supabase
      .channel(`realtime:${table}:${filter}`)
      .on("postgres_changes", { event: "*", schema: "public", table, filter }, () => callbackRef.current())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, filter]);
}
