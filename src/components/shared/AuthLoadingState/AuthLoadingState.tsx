import { useEffect, useState } from "react";

import { clearPersistedAuthSession } from "@/lib/supabase";

import styles from "./AuthLoadingState.module.css";

const HINT_DELAY_MS = 2000;
const RESET_BUTTON_DELAY_MS = 8000;
const PENDING_POLL_MS = 500;

type PendingRequest = { url: string; method: string; elapsedMs: number };

function shortenUrl(url: string): string {
  try {
    const { pathname, search } = new URL(url);
    const table = pathname.split("/").pop() || pathname;
    const params = new URLSearchParams(search);
    params.delete("select");
    const rest = params.toString();
    return rest ? `${table}?${rest}` : table;
  } catch {
    return url;
  }
}

// The initial auth check can stall for reasons that never surface as a
// console error or even a network request — e.g. supabase-js's own
// cross-tab lock getting stuck client-side, which can hang before it ever
// makes a fetch call. AuthContext races init against a hard 15s timeout as
// the real backstop; this button is the faster, user-facing escape hatch —
// it does exactly what manually deleting the sb-*-auth-token localStorage
// key does, without needing DevTools.
export default function AuthLoadingState() {
  const [showHint, setShowHint] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [pending, setPending] = useState<PendingRequest[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => setShowHint(true), HINT_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setShowReset(true), RESET_BUTTON_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const handleReset = () => {
    clearPersistedAuthSession();
    window.location.reload();
  };

  // Once the hint is showing, poll whatever request(s) supabase.ts's
  // fetchWithTimeout currently has in flight — this is the actual cause of
  // the delay, not a guess, and it's visible without opening DevTools.
  useEffect(() => {
    if (!showHint) return;
    const getPending = (window as unknown as { __supabasePendingRequests?: () => PendingRequest[] })
      .__supabasePendingRequests;
    if (!getPending) return;

    const poll = () => setPending(getPending());
    poll();
    const interval = setInterval(poll, PENDING_POLL_MS);
    return () => clearInterval(interval);
  }, [showHint]);

  // Kept for anyone digging in devtools, but not surfaced in the UI — raw
  // endpoint/method/timing isn't something a non-technical user needs to see.
  useEffect(() => {
    if (pending.length > 0) {
      console.error(
        "Still waiting on:",
        pending.map((p) => `${p.method} ${shortenUrl(p.url)} (${(p.elapsedMs / 1000).toFixed(1)}s)`),
      );
    }
  }, [pending]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.spinner} />
      {showHint && <p className={styles.hint}>Taking longer than usual…</p>}
      {showReset && (
        <>
          <p className={styles.hint}>Still stuck? This usually clears it.</p>
          <button type="button" className={styles.resetButton} onClick={handleReset}>
            Reset & reload
          </button>
        </>
      )}
    </div>
  );
}
