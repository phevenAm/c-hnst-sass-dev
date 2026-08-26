import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import styles from "./ViewportWarningBanner.module.scss";

const DISMISS_KEY = "viewport_warning_dismissed";
// Below the narrowest mainstream phones (iPhone SE/mini class, ~375px) —
// this should only fire for genuinely unusual/tiny viewports, not the
// average phone in someone's pocket.
const MIN_SUPPORTED_WIDTH = 350;

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
        This app works best on a larger screen — your screen is narrower than we support, so some things may not display
        well. You can zoom out in <Link to="/settings">Settings → Interface</Link>.
      </span>
      <button type="button" className={styles.dismiss} onClick={handleDismiss}>
        Dismiss
      </button>
    </div>
  );
}
