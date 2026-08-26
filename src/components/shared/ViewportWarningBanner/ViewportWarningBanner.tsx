import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import styles from "./ViewportWarningBanner.module.scss";

const DISMISS_KEY = "viewport_warning_dismissed";
// Matches $bp-sm in styles/_spacing.scss — by far the most-reused breakpoint
// in this codebase already (the "until-sm" mixin), rather than inventing a
// new bespoke cutoff for this one banner.
const MIN_SUPPORTED_WIDTH = 640;

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "true";
  } catch {
    return false;
  }
}

export default function ViewportWarningBanner() {
  const [tooNarrow, setTooNarrow] = useState(false);
  const [dismissed, setDismissed] = useState(readDismissed);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MIN_SUPPORTED_WIDTH - 1}px)`);
    setTooNarrow(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setTooNarrow(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  if (!tooNarrow || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "true");
    } catch {
      // private mode / storage disabled — just won't persist across reloads
    }
  };

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <span className={styles.message}>
        This app works best on a larger screen — some phones (e.g. iPhone 12) may not display everything well. You can
        zoom out in <Link to="/settings">Settings → Interface</Link>.
      </span>
      <button type="button" className={styles.dismiss} onClick={handleDismiss}>
        Dismiss
      </button>
    </div>
  );
}
