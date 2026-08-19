import { useEffect, useState } from "react";

import styles from "./AuthLoadingState.module.css";

const HINT_DELAY_MS = 2000;

// The initial auth check can be held up by Supabase's cross-tab lock, which
// serialises token refresh across tabs of this app so two tabs can't race
// and corrupt each other's session — normally invisible, but if another tab
// is holding it this one waits. A bare spinner looks broken; naming what's
// actually happening (only once it's taken long enough to matter) doesn't.
export default function AuthLoadingState() {
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowHint(true), HINT_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

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
