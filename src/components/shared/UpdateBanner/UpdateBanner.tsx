import { useEffect, useState } from "react";

import { hardRefresh, useVersionCheck } from "@Hooks/useVersionCheck";

import styles from "./UpdateBanner.module.scss";

// Once the banner is closed — by either button — it stays closed for the life
// of this tab / PWA window. sessionStorage is wiped when the app is closed, so
// a genuinely newer version still greets the user on the next launch; it just
// stops re-nagging within one session (the version check keeps reporting the
// same mismatch until the reload actually happens).
const DISMISS_KEY = "clarity:updateBannerDismissed";

const readDismissed = (): boolean => {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
};

const rememberDismissed = (): void => {
  try {
    sessionStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // private mode / storage disabled — the in-memory state below still holds
  }
};

function isPWA(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari iOS
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

export default function UpdateBanner() {
  const isOutdated = useVersionCheck();
  const [dismissed, setDismissed] = useState(readDismissed);
  const [inPWA, setInPWA] = useState(false);

  useEffect(() => {
    setInPWA(isPWA());
  }, []);

  if (!inPWA || !isOutdated || dismissed) return null;

  const close = () => {
    rememberDismissed();
    setDismissed(true);
  };

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
        <button type="button" className={styles.btnLater} onClick={close}>
          Later
        </button>
        <button
          type="button"
          className={styles.btnUpdate}
          onClick={() => {
            // hardRefresh() puts up the full-screen sapling + "Updating…"
            // splash straight away and holds it until the reload lands, so the
            // banner can close immediately — the splash is the feedback now,
            // and if the update somehow no-ops the banner won't keep nagging.
            void hardRefresh();
            close();
          }}
        >
          Update now
        </button>
      </div>
    </div>
  );
}
