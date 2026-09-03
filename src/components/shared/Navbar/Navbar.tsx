import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { pickColor } from "@Helpers/Helpers";

import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { useAppDispatch, useAppSelector, useFetchOnIdle } from "../../../store/hooks";
import { fetchPracticeSettings } from "../../../store/slices/practiceSettingsSlice";
import { selectThemeMode, toggleTheme } from "../../../store/slices/themeSlice";
import Avatar from "../Avatar/Avatar";
import { EncryptionStatusPill } from "../EncryptionStatusPill/EncryptionStatusPill";
import { CloseIcon, DarkmodeIcon, LeafLogoMark, LightmodeIcon, MenuIcon, Settingsicon } from "../Icons/Icons";
import { NotificationBell } from "../NotificationBell/NotificationBell";
import SkipToMain from "../SkipToMain/SkipToMain";

import styles from "./Navbar.module.scss";

export default function Navbar() {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const navigate = useNavigate();
  const themeMode = useAppSelector(selectThemeMode);
  const [menuOpen, setMenuOpen] = useState(false);
  const { isAdmin, isDemo, loading: authLoading, signIn, signOut, userProfile, displayName } = useAuth();
  const [switchingDemoRole, setSwitchingDemoRole] = useState<"admin" | "client" | null>(null);
  const { showToast } = useToast();

  useFetchOnIdle((state) => state.practiceSettings.status, fetchPracticeSettings, "Failed to load practice settings");
  const practiceLogoUrl = useAppSelector((state) => state.practiceSettings.data?.logo_url ?? null);

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Error signing out:", error);
      showToast("Couldn't sign out — check your connection and try again.", "danger");
    }
  };

  // signIn()'s promise resolving doesn't mean AuthContext has finished
  // loading the new account's profile/role yet — that's a separate async
  // fetch triggered by the auth-state-change event, with its own network
  // round trip. Navigating immediately after signIn() raced that fetch:
  // ProtectedRoute would see the *previous* role for a moment and bounce
  // straight back. Track the target role and navigate only once `loading`
  // has cleared and isAdmin actually reflects it — driven by confirmed
  // state instead of guessed timing.
  const handleSwitchDemoRole = async () => {
    const targetRole = isAdmin ? "client" : "admin";
    try {
      setSwitchingDemoRole(targetRole);
      await signIn(
        targetRole === "admin" ? "demo-admin@honest.com" : "demo-client@honest.com",
        targetRole === "admin" ? "DemoAdmin2026" : "DemoClient2026",
      );
    } catch (error) {
      console.error("Error switching demo role:", error);
      showToast("Couldn't switch demo accounts — try again in a moment.", "danger");
      setSwitchingDemoRole(null);
    }
  };

  useEffect(() => {
    if (!switchingDemoRole || authLoading) return;
    const reachedTarget = switchingDemoRole === "admin" ? isAdmin : !isAdmin;
    if (reachedTarget) {
      navigate(switchingDemoRole === "admin" ? "/admin" : "/dashboard");
      setSwitchingDemoRole(null);
    }
  }, [switchingDemoRole, authLoading, isAdmin, navigate]);

  const adminLinks = [
    { to: "/admin", label: "Dashboard" },
    { to: "/admin/clients", label: "Clients" },
    { to: "/admin/scheduler", label: "Schedule" },
    { to: "/admin/finances", label: "Finances" },
    { to: "/admin/forms", label: "Forms" },
    { to: "/admin/resources", label: "Resources" },
    { to: "/admin/cpd", label: "CPD Log" },
  ];

  const clientLinks = [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/my-sessions", label: "My sessions" },
    { to: "/check-in", label: "Check-in" },
    { to: "/resources", label: "Resources" },
  ];

  const links = isAdmin ? adminLinks : clientLinks;

  const createLinkRoleTestId = (link: { to: string; label: string }) => {
    return link.to.split("/").filter(Boolean).join("-");
  };

  return (
    <header className={styles.header}>
      <SkipToMain />
      <nav aria-label="Main navigation" className={styles.nav}>
        {/* Logo */}
        <Link
          to={isAdmin ? "/admin" : "/dashboard"}
          aria-label={isAdmin ? "Clarity Admin — home" : "Clarity — home"}
          className={styles.logo}
          data-testid="logo-link"
        >
          <div className={styles.logoMark}>
            {practiceLogoUrl ? (
              <img
                src={practiceLogoUrl}
                alt="Logo"
                style={{ width: "1.25rem", height: "1.25rem", objectFit: "contain" }}
              />
            ) : (
              <LeafLogoMark size={20} />
            )}
          </div>
          <span className={styles.logoText}>Clarity</span>
          {isAdmin && (
            <span className={styles.adminBadge} aria-hidden="true">
              Admin
            </span>
          )}
        </Link>

        {/* Desktop nav links */}
        <ul className={styles.desktopNav}>
          {links.map((link) => {
            const active = location.pathname === link.to;
            return (
              <li key={link.to}>
                <Link
                  to={link.to}
                  aria-current={active ? "page" : undefined}
                  className={`${styles.navLink} ${active ? styles.active : ""}`}
                  data-testid={`navbar-link-${createLinkRoleTestId(link)}`}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Right actions */}
        <div className={styles.actions}>
          {isDemo && (
            <button type="button" onClick={handleSwitchDemoRole} className={styles.iconBtn}>
              View as {isAdmin ? "client" : "therapist"}
            </button>
          )}

          <button
            type="button"
            onClick={() => dispatch(toggleTheme())}
            aria-label={`Switch to ${themeMode === "light" ? "dark" : "light"} mode`}
            className={styles.plainIcon}
          >
            {themeMode === "light" ? <DarkmodeIcon /> : <LightmodeIcon />}
          </button>

          <NotificationBell />

          {isAdmin && <EncryptionStatusPill />}

          <div className={styles.userSection}>
            {userProfile && (
              <Link to="/settings" className={styles.settingsLinkCog} aria-label="settings">
                <span className={styles.settingsIcon}>
                  <Settingsicon />
                </span>
                <Avatar
                  name={displayName || `${userProfile.first_name} ${userProfile.last_name}`}
                  color={pickColor(userProfile.id)}
                  size={34}
                  imageSrc={userProfile.avatar_url || ""}
                />
              </Link>
            )}
            <button onClick={handleLogout} aria-label="Sign out" className={styles.signOutBtn} type="button">
              Sign out
            </button>
          </div>

          <button
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            className={styles.menuBtn}
            type="button"
          >
            {menuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </nav>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div id="mobile-menu" className={styles.mobileMenu}>
          <ul className={styles.mobileMenuList}>
            {links.map((link) => {
              const active = location.pathname === link.to;
              return (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    onClick={() => setMenuOpen(false)}
                    className={`${styles.mobileNavLink} ${active ? styles.active : ""}`}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              handleLogout();
            }}
            className={styles.mobileSignOut}
          >
            Sign out
          </button>
        </div>
      )}
    </header>
  );
}
