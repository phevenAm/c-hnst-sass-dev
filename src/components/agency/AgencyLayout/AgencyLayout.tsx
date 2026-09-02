import { Suspense } from "react";
import { Link, Navigate, NavLink, Outlet } from "react-router-dom";

import AuthLoadingState from "@components/shared/AuthLoadingState/AuthLoadingState";
import Button from "@components/shared/Button/Button";
import { LeafLogoMark } from "@components/shared/Icons/Icons";
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
  { to: "/agency", label: "Overview", end: true },
  { to: "/agency/members", label: "Members" },
  { to: "/agency/clients", label: "Clients" },
  { to: "/agency/finance", label: "Finance" },
  { to: "/agency/onboarding", label: "Onboarding" },
  { to: "/agency/settings", label: "Settings" },
];

// Wraps every /agency route. Requires an active agency membership; managers get
// the full manage-mode nav, plain counsellors are bounced to their intake inbox.
export default function AgencyLayout() {
  const { loading, signOut } = useAuth();
  const status = useAppSelector(selectAgencyBootstrapStatus);
  const membership = useAppSelector(selectAgencyMembership);
  const agency = useAppSelector(selectAgency);
  const isManager = useAppSelector(selectIsAgencyManager);

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

  const links = isManager ? MANAGER_LINKS : [{ to: "/agency/incoming", label: "Clients to review", end: true }];

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <Link to={isManager ? "/agency" : "/agency/incoming"} className={styles.brand}>
          <LeafLogoMark size={20} />
          {agency?.name ?? "Agency"}
          <span className={styles.badge}>Manage</span>
        </Link>

        <nav className={styles.nav} aria-label="Agency navigation">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ""}`}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        {membership.counselling_enabled && (
          <Link to="/admin" className={styles.exit}>
            ← Counselling
          </Link>
        )}
      </header>

      <main id="main-content" className={styles.main}>
        <Suspense fallback={<AuthLoadingState />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
