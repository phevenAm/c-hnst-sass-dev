import { Suspense, useEffect, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router-dom";

import AuthLoadingState from "@components/shared/AuthLoadingState/AuthLoadingState";
import Button from "@components/shared/Button/Button";
import {
  AssignmentClipIcon,
  BookIcon,
  HomeIcon,
  LeafLogoMark,
  MenuIcon,
  MoneyIcon,
  Settingsicon,
  UsersIcon,
} from "@components/shared/Icons/Icons";
import { useAuth } from "@context/AuthContext";
import { useAppSelector } from "@store/hooks";
import {
  selectAgency,
  selectAgencyBootstrapStatus,
  selectAgencyMembership,
  selectIsAgencyManager,
} from "@store/slices/agencySlice";

import styles from "./AgencyLayout.module.scss";

const MANAGER_LINKS = [
  { to: "/agency", label: "Overview", end: true, Icon: HomeIcon },
  { to: "/agency/members", label: "Members", Icon: UsersIcon },
  { to: "/agency/clients", label: "Clients", Icon: AssignmentClipIcon },
  { to: "/agency/finance", label: "Finance", Icon: MoneyIcon },
  { to: "/agency/onboarding", label: "Onboarding", Icon: BookIcon },
  { to: "/agency/settings", label: "Settings", Icon: Settingsicon },
];

const COUNSELLOR_LINKS = [{ to: "/agency/incoming", label: "Clients to review", end: true, Icon: AssignmentClipIcon }];

// Wraps every /agency route. Requires an active agency membership; managers get
// the full manage-mode nav, plain counsellors are bounced to their intake inbox.
export default function AgencyLayout() {
  const { loading, signOut } = useAuth();
  const { pathname } = useLocation();
  const status = useAppSelector(selectAgencyBootstrapStatus);
  const membership = useAppSelector(selectAgencyMembership);
  const agency = useAppSelector(selectAgency);
  const isManager = useAppSelector(selectIsAgencyManager);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: close the drawer on every navigation
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  if (loading || status === "idle" || status === "loading") {
    return <AuthLoadingState variant="splash" />;
  }

  if (!membership) return <Navigate to="/" replace />;

  if (membership.status === "disabled") {
    return (
      <div className={styles.shell}>
        <div className={styles.notice}>
          <h1>Your agency access is suspended</h1>
          <p>A manager at your agency has disabled your account. Please get in touch with them to restore access.</p>
          <Button variant="secondary" onClick={() => signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  const links = isManager ? MANAGER_LINKS : COUNSELLOR_LINKS;
  const agencyName = agency?.name ?? "Agency";

  return (
    <div className={styles.shell}>
      <div className={styles.mobileBar}>
        <button
          type="button"
          className={styles.hamburger}
          onClick={() => setDrawerOpen((o) => !o)}
          aria-label="Open agency menu"
          aria-expanded={drawerOpen}
        >
          <MenuIcon />
        </button>
        <span className={styles.mobileTitle}>{agencyName}</span>
      </div>

      {drawerOpen && (
        <button type="button" className={styles.overlay} aria-label="Close menu" onClick={() => setDrawerOpen(false)} />
      )}

      <aside className={`${styles.sidebar} ${drawerOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.brand}>
          <Link to={isManager ? "/agency" : "/agency/incoming"} className={styles.lockup}>
            <span className={styles.clarity}>
              <LeafLogoMark size={20} />
              Clarity
            </span>
            <span className={styles.divider} aria-hidden="true" />
            <span className={styles.agencyMark}>
              {agency?.logo_url && <img src={agency.logo_url} alt="" className={styles.agencyLogo} />}
              <span className={styles.agencyName}>{agencyName}</span>
            </span>
          </Link>
          <span className={styles.modePill}>Manage mode</span>
        </div>

        <nav className={styles.nav} aria-label="Agency navigation">
          {links.map(({ to, label, end, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ""}`}
            >
              <Icon />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {membership.counselling_enabled && (
          <div className={styles.sidebarFoot}>
            <Link to="/admin" className={styles.modeSwitch}>
              <HomeIcon />
              <span>Counselling view</span>
            </Link>
          </div>
        )}
      </aside>

      <main id="main-content" className={styles.main}>
        <Suspense fallback={<AuthLoadingState variant="plain" />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
