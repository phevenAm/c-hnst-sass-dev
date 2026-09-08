import { Suspense, useEffect, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation, useSearchParams } from "react-router-dom";

import AuthLoadingState from "@components/shared/AuthLoadingState/AuthLoadingState";
import Button from "@components/shared/Button/Button";
import {
  AssignmentClipIcon,
  BookIcon,
  CalendarIcon,
  CancelIcon,
  ChevronDownSmIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardIcon,
  DocumentIcon,
  HistoryIcon,
  HomeIcon,
  MoneyIcon,
  RescheduleIcon,
  Settingsicon,
  UsersIcon,
} from "@components/shared/Icons/Icons";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";
import { useAppSelector } from "@store/hooks";
import {
  selectAgency,
  selectAgencyBootstrapStatus,
  selectAgencyMembership,
  selectIsAgencyManager,
} from "@store/slices/agencySlice";

import styles from "./AgencyLayout.module.scss";

type NavLeaf = { to: string; label: string; end?: boolean; Icon: React.ComponentType };
type NavItem = NavLeaf & { children?: NavLeaf[] };

const MANAGER_LINKS: NavItem[] = [
  { to: "/agency", label: "Overview", end: true, Icon: HomeIcon },
  {
    to: "/agency/clients?view=active",
    label: "Clients",
    Icon: AssignmentClipIcon,
    // Waiting list is the same page (AgencyClientsPage) on ?view=waiting —
    // nest it under Clients rather than as a sibling row.
    children: [{ to: "/agency/clients?view=waiting", label: "Waiting list", Icon: ClipboardIcon }],
  },
  { to: "/agency/sessions", label: "Sessions", Icon: CalendarIcon },
  { to: "/agency/members", label: "Staff", Icon: UsersIcon },
  { to: "/agency/invoices", label: "Invoices", Icon: DocumentIcon },
  { to: "/agency/finance", label: "Finance", Icon: MoneyIcon },
  { to: "/agency/onboarding", label: "Onboarding", Icon: BookIcon },
  { to: "/agency/settings", label: "Settings", Icon: Settingsicon },
];

const COUNSELLOR_LINKS: NavItem[] = [
  { to: "/agency/incoming", label: "Clients to review", end: true, Icon: AssignmentClipIcon },
];

const CLIENTS_PATH = "/agency/clients";

const MOBILE_Q = "(max-width: 860px)";

// Wraps every /agency route. Requires an active agency membership; managers get
// the full manage-mode nav, plain counsellors are bounced to their intake inbox.
// Mirrors AdminSidebar: on narrow screens the sidebar is a slim icon rail that
// an edge chevron expands to a labelled overlay (no separate hamburger bar).
export default function AgencyLayout() {
  const { loading, signOut } = useAuth();
  const { showToast } = useToast();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const status = useAppSelector(selectAgencyBootstrapStatus);
  const membership = useAppSelector(selectAgencyMembership);
  const agency = useAppSelector(selectAgency);
  const isManager = useAppSelector(selectIsAgencyManager);

  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_Q).matches);
  const [expanded, setExpanded] = useState(false);
  // "Clients" submenu (holds Waiting list) — open whenever a clients view is showing.
  const onClientsPage = pathname === CLIENTS_PATH || pathname.startsWith(`${CLIENTS_PATH}/`);
  const [clientsOpen, setClientsOpen] = useState(onClientsPage);
  useEffect(() => {
    if (onClientsPage) setClientsOpen(true);
  }, [onClientsPage]);
  const clientsView = searchParams.get("view");

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_Q);
    const onChange = () => {
      setIsMobile(mq.matches);
      if (!mq.matches) setExpanded(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: collapse the rail after navigating on mobile
  useEffect(() => {
    setExpanded(false);
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
  const railOpen = !isMobile || expanded;

  // The pill under the agency name doubles as a role marker. Managers are
  // "managing" the agency; everyone else is here as staff — an employee, or a
  // freelance associate — so say which rather than mislabel them "Manage mode".
  let rolePill = "Manage mode";
  if (!isManager) rolePill = membership.employment_type === "freelance" ? "Associate" : "Staff";

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch {
      showToast("Couldn't sign out — check your connection and try again.", "danger");
    }
  };

  return (
    <div className={styles.shell}>
      {isMobile && expanded && (
        <button type="button" className={styles.backdrop} aria-label="Close menu" onClick={() => setExpanded(false)} />
      )}

      <aside className={`${styles.sidebar} ${railOpen ? styles.open : ""}`} aria-label="Agency navigation">
        <div className={styles.brand}>
          <Link to={isManager ? "/agency" : "/agency/incoming"} className={styles.brandLink}>
            {agency?.logo_url ? (
              <img src={agency.logo_url} alt="" className={styles.agencyLogo} />
            ) : (
              <span className={styles.logoFallback} aria-hidden="true">
                {agencyName.charAt(0).toUpperCase()}
              </span>
            )}
            <span className={styles.agencyName}>{agencyName}</span>
          </Link>
          <span className={`${styles.modePill} ${isManager ? "" : styles.modePillStaff}`}>{rolePill}</span>
        </div>

        <nav className={styles.nav}>
          {links.map((item) => {
            if (item.children?.length) {
              // "Clients" — a link that also toggles a nested submenu (Waiting list).
              const parentActive = onClientsPage && clientsView !== "waiting";
              return (
                <div key={item.to} className={styles.navGroup}>
                  <div className={`${styles.link} ${styles.groupRow} ${parentActive ? styles.active : ""}`}>
                    <NavLink to={item.to} className={styles.groupLink} title={railOpen ? undefined : item.label}>
                      <span className={styles.linkIcon}>
                        <item.Icon />
                      </span>
                      <span className={styles.linkLabel}>{item.label}</span>
                    </NavLink>
                    <button
                      type="button"
                      className={styles.groupToggle}
                      aria-expanded={clientsOpen}
                      aria-label={clientsOpen ? `Collapse ${item.label}` : `Expand ${item.label}`}
                      onClick={() => setClientsOpen((v) => !v)}
                    >
                      <span className={`${styles.groupChevron} ${clientsOpen ? styles.groupChevronOpen : ""}`}>
                        <ChevronDownSmIcon />
                      </span>
                    </button>
                  </div>
                  <div className={`${styles.groupChildren} ${clientsOpen ? styles.groupChildrenOpen : ""}`}>
                    {item.children.map((child) => {
                      const childActive = onClientsPage && clientsView === "waiting";
                      return (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          tabIndex={clientsOpen ? undefined : -1}
                          title={railOpen ? undefined : child.label}
                          className={`${styles.link} ${styles.childLink} ${childActive ? styles.active : ""}`}
                        >
                          <span className={styles.linkIcon}>
                            <child.Icon />
                          </span>
                          <span className={styles.linkLabel}>{child.label}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                </div>
              );
            }
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                title={railOpen ? undefined : item.label}
                className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ""}`}
              >
                <span className={styles.linkIcon}>
                  <item.Icon />
                </span>
                <span className={styles.linkLabel}>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className={styles.sidebarFoot}>
          {isManager && (
            <NavLink
              to="/agency/activity"
              title={railOpen ? undefined : "Activity"}
              className={({ isActive }) => `${styles.modeSwitch} ${isActive ? styles.active : ""}`}
            >
              <span className={styles.linkIcon}>
                <HistoryIcon />
              </span>
              <span className={styles.linkLabel}>Activity</span>
            </NavLink>
          )}
          {membership.counselling_enabled && (
            <Link to="/admin" className={styles.modeSwitch} title={railOpen ? undefined : "Counselling view"}>
              <span className={styles.linkIcon}>
                <RescheduleIcon />
              </span>
              <span className={styles.linkLabel}>Counselling view</span>
            </Link>
          )}
          <button
            type="button"
            className={styles.signOut}
            onClick={handleSignOut}
            title={railOpen ? undefined : "Sign out"}
          >
            <span className={styles.linkIcon}>
              <CancelIcon />
            </span>
            <span className={styles.linkLabel}>Sign out</span>
          </button>
          <p className={styles.poweredBy}>
            <span className={styles.linkLabel}>
              Powered by{" "}
              <a href="https://withclarity.uk" target="_blank" rel="noopener noreferrer">
                Clarity
              </a>
              {" · "}v{__APP_VERSION__}
            </span>
          </p>
        </div>

        {isMobile && (
          <button
            type="button"
            className={styles.edgeToggle}
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Collapse menu" : "Expand menu"}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronLeftIcon /> : <ChevronRightIcon />}
          </button>
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
