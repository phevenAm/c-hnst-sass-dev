import { useAuth } from "@context/AuthContext";

import { useAppSelector } from "@/store/hooks";

import styles from "./PausedBanner.module.scss";

// Reads the shared practice_settings cache directly rather than
// useAuth().practiceSettings, which is deliberately admin-only (see
// AuthContext) — a paused practice needs this visible to clients too, and
// RLS already scopes the row correctly for either role. isAdmin only steers
// the wording (who can actually resume it).
export default function PausedBanner() {
  const isPaused = useAppSelector((state) => state.practiceSettings.data?.is_paused ?? false);
  const { isAdmin } = useAuth();
  if (!isPaused) return null;

  return (
    <div className={styles.banner} role="status">
      <p>
        <strong>This practice is paused</strong> — everything is read-only until it's resumed.{" "}
        {isAdmin ? (
          <>Resume it from Settings → Billing whenever you're ready. Nothing has been lost.</>
        ) : (
          <>Your practitioner has paused their account. Please contact them directly with any questions.</>
        )}
      </p>
    </div>
  );
}
