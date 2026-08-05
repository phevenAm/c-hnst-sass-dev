import { useAuth } from "@context/AuthContext";

import styles from "./DemoBanner.module.scss";

export default function DemoBanner() {
  const { isDemo } = useAuth();
  if (!isDemo) return null;

  return (
    <div className={styles.banner} role="status">
      <p className={styles.icon} aria-hidden="true"></p>
      <p>
        <strong>Demo mode</strong> — you're exploring a read-only preview. Changes are disabled.
      </p>
    </div>
  );
}
