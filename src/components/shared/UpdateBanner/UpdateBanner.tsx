import { useEffect, useState } from "react";

import { hardRefresh, useVersionCheck } from "@Hooks/useVersionCheck";

import styles from "./UpdateBanner.module.scss";

function isPWA(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari iOS
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

export default function UpdateBanner() {
  const isOutdated = useVersionCheck();
  const [dismissed, setDismissed] = useState(false);
  const [inPWA, setInPWA] = useState(false);

  useEffect(() => {
    setInPWA(isPWA());
  }, []);

  // Un-dismiss whenever a new update is detected
  useEffect(() => {
    if (isOutdated) setDismissed(false);
  }, [isOutdated]);

  if (!inPWA || !isOutdated || dismissed) return null;

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <span className={styles.message}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className={styles.icon}>
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 5v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
        </svg>
        A new version is available.
      </span>
      <div className={styles.actions}>
        <button type="button" className={styles.btnLater} onClick={() => setDismissed(true)}>
          Later
        </button>
        <button
          type="button"
          className={styles.btnUpdate}
          onClick={() => {
            hardRefresh();
            setDismissed(true);
          }}
        >
          Update now
        </button>
      </div>
    </div>
  );
}
