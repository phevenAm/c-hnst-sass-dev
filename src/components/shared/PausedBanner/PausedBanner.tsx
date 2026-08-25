import { useAppSelector } from "@/store/hooks";

import styles from "./PausedBanner.module.scss";

// Reads the shared practice_settings cache directly rather than
// useAuth().practiceSettings, which is deliberately admin-only (see
// AuthContext) — a paused practice needs this visible to clients too, and
// RLS already scopes the row correctly for either role.
export default function PausedBanner() {
  const isPaused = useAppSelector((state) => state.practiceSettings.data?.is_paused ?? false);
  if (!isPaused) return null;

  return (
    <div className={styles.banner} role="status">
      <p>
        <strong>This account is paused</strong> — everything is read-only until it's resumed. Contact support with any
        questions.
      </p>
    </div>
  );
}
