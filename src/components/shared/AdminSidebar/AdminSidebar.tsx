import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { useHasFileManager } from "@Hooks/useHasFileManager";
import { useAuth } from "@context/AuthContext";
import { useAppSelector } from "@store/hooks";
import { selectTotalUnread } from "@store/slices/messagesSlice";

import { isFeatureEnabled } from "@/lib/featureFlags";
import CountBadge from "../CountBadge/CountBadge";
import FeedbackModal from "../FeedbackModal/FeedbackModal";
import {
  AssignmentClipIcon,
  BookIcon,
  CalendarIcon,
  ChatIcon,
  CpdIcon,
  FolderIcon,
  HistoryIcon,
  HomeIcon,
  IdeasIcon,
  LayersIcon,
  LeafLogoMark,
  MoneyIcon,
  SupervisionLogoMark,
  UsersIcon,
} from "../Icons/Icons";
import SidebarCollapseButton from "../SidebarCollapseButton/SidebarCollapseButton";
import SidebarNavGroup, { type SidebarNavGroupClasses, type SidebarNavLeaf } from "../SidebarNavGroup/SidebarNavGroup";
import SidebarNavItem, { type SidebarNavItemClasses } from "../SidebarNavItem/SidebarNavItem";
import { SIDEBAR_MOBILE_QUERY } from "../sidebarBreakpoint";

import styles from "./AdminSidebar.module.scss";

type NavLeaf = { to: string; label: string; Icon: React.ComponentType; exact: boolean };
type NavGroup = { label: string; Icon: React.ComponentType; children: SidebarNavLeaf[] };
type NavItem = NavLeaf | NavGroup;

const isGroup = (item: NavItem): item is NavGroup => "children" in item;

const NAV: NavItem[] = [
  { to: "/admin", label: "Dashboard", Icon: HomeIcon, exact: true },
  { to: "/admin/scheduler", label: "Schedule", Icon: CalendarIcon, exact: false },
  { to: "/admin/clients", label: "Clients", Icon: UsersIcon, exact: false },
  ...(isFeatureEnabled("messaging")
    ? [{ to: "/admin/messages", label: "Messages", Icon: ChatIcon, exact: false } as NavLeaf]
    : []),
  { to: "/admin/forms", label: "Forms", Icon: AssignmentClipIcon, exact: false },
  { to: "/admin/finances", label: "Finances", Icon: MoneyIcon, exact: false },
  { to: "/admin/resources", label: "Resources", Icon: BookIcon, exact: false },
  // "Files" (/admin/files) is spliced in here at render time for tiers that have
  // storage — see the useHasFileManager() branch in the component below.
  {
    label: "Logs",
    Icon: LayersIcon,
    children: [
      { to: "/admin/cpd", label: "CPD", Icon: CpdIcon },
      { to: "/admin/supervision", label: "Supervision", Icon: SupervisionLogoMark },
    ],
  },
];

// Same shared components AgencyLayout builds its nav from (SidebarNavGroup /
// SidebarNavItem) — group flyout/hover-intent/collapse behaviour lives in
// exactly one place now, not hand-rolled separately per sidebar.
const adminItemCx: SidebarNavItemClasses = {
  link: styles.navLink,
  icon: styles.icon,
  label: styles.label,
};

const adminGroupCx: SidebarNavGroupClasses = {
  group: styles.groupItem,
  row: styles.groupBtn,
  rowActive: styles.groupActive,
  icon: styles.icon,
  label: styles.label,
  chevron: styles.groupChevron,
  chevronOpen: styles.groupChevronOpen,
  children: styles.groupChildren,
  childrenOpen: styles.groupChildrenOpen,
  childLink: styles.childLink,
  childActive: styles.active,
};

export default function AdminSidebar({
  collapsed,
  onToggle,
  isOpen,
  onClose,
}: {
  collapsed: boolean;
  onToggle: () => void;
  isOpen: boolean;
  onClose: () => void;
}) {
  const location = useLocation();
  const { isDemo } = useAuth();
  const totalUnread = useAppSelector(selectTotalUnread);
  const hasFileManager = useHasFileManager();

  // Splice "Files" in after "Resources" only for tiers with storage (Growth+ /
  // agency). Starter has a 0-byte quota, so the page is hidden for it.
  const nav = useMemo<NavItem[]>(() => {
    if (!hasFileManager) return NAV;
    const at = NAV.findIndex((item) => !isGroup(item) && item.to === "/admin/resources");
    const files: NavLeaf = { to: "/admin/files", label: "Files", Icon: FolderIcon, exact: false };
    return at === -1 ? [...NAV, files] : [...NAV.slice(0, at + 1), files, ...NAV.slice(at + 1)];
  }, [hasFileManager]);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(SIDEBAR_MOBILE_QUERY).matches);

  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia(SIDEBAR_MOBILE_QUERY);
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const isFlyoutMode = collapsed || (isMobile && !isOpen);

  return (
    <>
      {isOpen && <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />}
      <aside
        className={`${styles.sidebar} ${collapsed ? styles.collapsed : ""} ${isOpen ? styles.mobileOpen : ""}`}
        aria-label="Admin navigation"
      >
        <div className={styles.top} ref={topRef}>
          <Link to="/admin" className={styles.logo} aria-label="Clarity Admin — home">
            <div className={styles.logoMark}>
              <LeafLogoMark size={20} />
            </div>
            <span className={styles.logoText}>Clarity</span>
          </Link>
        </div>

        <nav aria-label="Admin pages" className={styles.nav}>
          {nav.map((item) => {
            if (isGroup(item)) {
              const anyChildActive = item.children.some((c) => location.pathname.startsWith(c.to));
              return (
                <SidebarNavGroup
                  key={item.label}
                  label={item.label}
                  Icon={item.Icon}
                  items={item.children}
                  parentActive={false}
                  isItemActive={(to) => location.pathname.startsWith(to)}
                  flyoutMode={isFlyoutMode}
                  hoverIntent={collapsed && !isMobile}
                  forceOpen={!isFlyoutMode && anyChildActive}
                  showTitle={collapsed}
                  onNavigate={onClose}
                  cx={adminGroupCx}
                />
              );
            }

            return (
              <SidebarNavItem
                key={item.to}
                to={item.to}
                end={item.exact}
                label={item.label}
                Icon={item.Icon}
                showTitle={collapsed || !isOpen}
                onNavigate={onClose}
                badge={
                  item.to === "/admin/messages" ? (
                    <CountBadge count={totalUnread} className={styles.navUnread} />
                  ) : undefined
                }
                cx={adminItemCx}
              />
            );
          })}
        </nav>

        <div className={styles.bottom} ref={bottomRef}>
          {!isDemo && (
            <button
              type="button"
              className={styles.bottomLink}
              onClick={() => setFeedbackOpen(true)}
              title={collapsed ? "Give feedback" : undefined}
            >
              <span className={styles.icon}>
                <IdeasIcon />
              </span>
              <span className={styles.label}>Give feedback</span>
            </button>
          )}

          <Link
            to="/admin/audit-logs"
            className={styles.bottomLink}
            title={collapsed ? "Activity" : undefined}
            onClick={onClose}
          >
            <span className={styles.icon}>
              <HistoryIcon />
            </span>
            <span className={styles.label}>Activity</span>
          </Link>

          <div className={styles.branding}>
            <span className={styles.label}>
              Powered by{" "}
              <a
                href="https://withclarity.uk"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.brandingLink}
              >
                Clarity
              </a>
              {" · "}
              <span className={styles.version}>v{__APP_VERSION__}</span>
            </span>
          </div>
        </div>

        <SidebarCollapseButton
          collapsed={collapsed}
          isOpen={isOpen}
          isMobile={isMobile}
          onToggle={onToggle}
          topRef={topRef}
          bottomRef={bottomRef}
          className={styles.collapseBtn}
        />
      </aside>

      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
    </>
  );
}
