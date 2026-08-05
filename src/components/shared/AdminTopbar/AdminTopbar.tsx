import { Link } from "react-router-dom";

import { pickColor } from "@Helpers/Helpers";
import { useAuth } from "@context/AuthContext";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { selectThemeMode, toggleTheme } from "@store/slices/themeSlice";

import Avatar from "../Avatar/Avatar";
import { MenuIcon, MoonIcon, Settingsicon, SunIcon } from "../Icons/Icons";
import { NotificationBell } from "../NotificationBell/NotificationBell";
import SkipToMain from "../SkipToMain/SkipToMain";

import styles from "./AdminTopbar.module.scss";

export default function AdminTopbar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const dispatch = useAppDispatch();
  const themeMode = useAppSelector(selectThemeMode);
  const { signOut, userProfile, displayName } = useAuth();

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <header className={styles.topbar}>
      <SkipToMain />

      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!collapsed}
        className={styles.toggleBtn}
      >
        <MenuIcon />
      </button>

      <div className={styles.actions}>
        <button
          type="button"
          onClick={() => dispatch(toggleTheme())}
          aria-label={`Switch to ${themeMode === "light" ? "dark" : "light"} mode`}
          className={styles.iconBtn}
        >
          {themeMode === "light" ? <MoonIcon /> : <SunIcon />}
        </button>

        <NotificationBell />

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
