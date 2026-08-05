import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { pickColor } from "@Helpers/Helpers";

import { useAuth } from "../../../context/AuthContext";
import { supabase } from "../../../lib/supabase.js";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";
import { selectThemeMode, toggleTheme } from "../../../store/slices/themeSlice";
import Avatar from "../Avatar/Avatar";
import { CloseIcon, LogoIcon, MenuIcon, MoonIcon, Settingsicon, SunIcon } from "../Icons/Icons";
import { NotificationBell } from "../NotificationBell/NotificationBell";
import SkipToMain from "../SkipToMain/SkipToMain";

import styles from "./Navbar.module.scss";

export default function Navbar() {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const themeMode = useAppSelector(selectThemeMode);
  const [menuOpen, setMenuOpen] = useState(false);
  const [practiceLogoUrl, setPracticeLogoUrl] = useState<string | null>(null);
  const { isAdmin, signOut, userProfile, displayName } = useAuth();

  useEffect(() => {
    supabase
      .from("practice_settings")
      .select("logo_url")
      .limit(1)
      .single()
      .then(({ data }) => setPracticeLogoUrl(data?.logo_url ?? null));
  }, []);

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const adminLinks = [
    { to: "/admin", label: "Dashboard" },
    { to: "/admin/clients", label: "Clients" },
    { to: "/admin/scheduler", label: "Schedule" },
    { to: "/admin/payments", label: "Payments" },
    { to: "/admin/questionnaires", label: "Check-ins" },
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
          aria-label={isAdmin ? "WithMe Admin — home" : "WithMe — home"}
          className={styles.logo}
          data-testid="logo-link"
        >
          <div className={styles.logoMark}>
            {practiceLogoUrl ? (
              <img src={practiceLogoUrl} alt="Logo" style={{ width: 20, height: 20, objectFit: "contain" }} />
            ) : (
              <LogoIcon />
            )}
          </div>
          <span className={styles.logoText}>WithMe</span>
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
          <button
            type="button"
            onClick={() => dispatch(toggleTheme())}
            aria-label={`Switch to ${themeMode === "light" ? "dark" : "light"} mode`}
            className={styles.iconBtn}
          >
            {themeMode === "light" ? <MoonIcon /> : <SunIcon />}
          </button>

          <NotificationBell />

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
