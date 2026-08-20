import { useEffect, useState } from "react";

import styles from "./AuthLoadingState.module.css";

const HINT_DELAY_MS = 2000;
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

// The initial auth check can be held up by Supabase's cross-tab lock, which
// serialises token refresh across tabs of this app so two tabs can't race
// and corrupt each other's session — normally invisible, but if another tab
// is holding it this one waits. A bare spinner looks broken; naming what's
// actually happening (only once it's taken long enough to matter) doesn't.
export default function AuthLoadingState() {
  const [showHint, setShowHint] = useState(false);
  const [pending, setPending] = useState<PendingRequest[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => setShowHint(true), HINT_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

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
      {showHint && (
        <p className={styles.hint}>
          Taking longer than usual — this can happen if you have this app open in another tab. Try closing other tabs of
          it.
        </p>
      )}
    </div>
  );
}
