import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { pickColor } from "@Helpers/Helpers";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { selectThemeMode, toggleTheme } from "@store/slices/themeSlice";

import Avatar from "../Avatar/Avatar";
import { EncryptionStatusPill } from "../EncryptionStatusPill/EncryptionStatusPill";
import { MoonIcon, Settingsicon, SunIcon } from "../Icons/Icons";
import { NotificationBell } from "../NotificationBell/NotificationBell";

import styles from "./AdminTopbar.module.scss";

export default function AdminTopbar() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const themeMode = useAppSelector(selectThemeMode);
  const { isDemo, isAdmin, loading: authLoading, signIn, signOut, userProfile, displayName } = useAuth();
  const { showToast } = useToast();
  const [switchingToClient, setSwitchingToClient] = useState(false);

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Error signing out:", error);
      showToast("Couldn't sign out — check your connection and try again.", "danger");
    }
  };

  // Navbar.tsx (the client-side layout) has always had a "View as
  // therapist"/"View as client" toggle for demo mode, but AdminLayout never
  // renders Navbar — it has its own AdminTopbar — so the client -> admin
  // direction worked while admin -> client had no button at all. Mirrors
  // Navbar's fix: wait for `loading` to clear and isAdmin to actually flip
  // before navigating, since signIn() resolving doesn't mean the new
  // account's profile has finished loading yet (a separate network call).
  const handleSwitchToClient = async () => {
    try {
      setSwitchingToClient(true);
      await signIn("demo-client@honest.com", "DemoClient2026");
    } catch (error) {
      console.error("Error switching demo role:", error);
      showToast("Couldn't switch demo accounts — try again in a moment.", "danger");
      setSwitchingToClient(false);
    }
  };

  useEffect(() => {
    if (!switchingToClient || authLoading) return;
    if (!isAdmin) {
      navigate("/dashboard");
      setSwitchingToClient(false);
    }
  }, [switchingToClient, authLoading, isAdmin, navigate]);

  return (
    <header className={styles.topbar}>
      <div className={styles.actions}>
        {isDemo && (
          <button type="button" onClick={handleSwitchToClient} className={styles.iconBtn}>
            View as client
          </button>
        )}

        <button
          type="button"
          onClick={() => dispatch(toggleTheme())}
          aria-label={`Switch to ${themeMode === "light" ? "dark" : "light"} mode`}
          className={styles.iconBtn}
        >
          {themeMode === "light" ? <MoonIcon /> : <SunIcon />}
        </button>

        <NotificationBell />

        <EncryptionStatusPill />

        {userProfile && (
          <Link to="/settings" className={styles.avatarLink} aria-label="Settings">
            <span className={styles.settingsIcon}>
              <Settingsicon />
            </span>
            <Avatar
              name={displayName || `${userProfile.first_name} ${userProfile.last_name}`}
              color={pickColor(userProfile.id)}
              size={32}
              imageSrc={userProfile.avatar_url || ""}
            />
          </Link>
        )}

        <button type="button" onClick={handleLogout} aria-label="Sign out" className={styles.signOutBtn}>
          Sign out
        </button>
      </div>
    </header>
  );
}
