import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { useAuth } from "@context/AuthContext";

import FeedbackModal from "../FeedbackModal/FeedbackModal";
import {
  BookIcon,
  CalendarIcon,
  ChevronDownSmIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CpdIcon,
  HistoryIcon,
  HomeIcon,
  IdeasIcon,
  LayersIcon,
  LeafLogoMark,
  MoneyIcon,
  PollsIcon,
  SupervisionLogoMark,
  UsersIcon,
} from "../Icons/Icons";

import styles from "./AdminSidebar.module.scss";

type NavLeaf = { to: string; label: string; Icon: React.ComponentType; exact: boolean };
type NavGroup = { label: string; Icon: React.ComponentType; children: Omit<NavLeaf, "exact">[] };
type NavItem = NavLeaf | NavGroup;

const isGroup = (item: NavItem): item is NavGroup => "children" in item;

const NAV: NavItem[] = [
  { to: "/admin", label: "Dashboard", Icon: HomeIcon, exact: true },
  { to: "/admin/scheduler", label: "Schedule", Icon: CalendarIcon, exact: false },
  { to: "/admin/clients", label: "Clients", Icon: UsersIcon, exact: false },
  { to: "/admin/forms", label: "Forms", Icon: PollsIcon, exact: false },
  { to: "/admin/payments", label: "Payments", Icon: MoneyIcon, exact: false },
  { to: "/admin/resources", label: "Resources", Icon: BookIcon, exact: false },
  {
    label: "Logs",
    Icon: LayersIcon,
    children: [
      { to: "/admin/cpd", label: "CPD", Icon: CpdIcon },
      { to: "/admin/supervision", label: "Supervision", Icon: SupervisionLogoMark },
    ],
  },
];

const LOG_PATHS = ["/admin/cpd", "/admin/supervision"];

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
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [btnPos, setBtnPos] = useState<"top" | "middle" | "bottom">(
    () => (localStorage.getItem("adminSidebarBtnPos") as "top" | "middle" | "bottom") ?? "top",
  );
  const [logsOpen, setLogsOpen] = useState(() => LOG_PATHS.some((p) => location.pathname.startsWith(p)));
  const [flyoutTop, setFlyoutTop] = useState(0);

  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const groupBtnRef = useRef<HTMLButtonElement>(null);
  const flyoutListRef = useRef<HTMLUListElement>(null);
  const firstChildRef = useRef<HTMLAnchorElement>(null);
  const [measured, setMeasured] = useState({ top: 55, bottom: 120 });

  useLayoutEffect(() => {
    const measure = () => {
      setMeasured({
        top: topRef.current?.offsetHeight ?? 55,
        bottom: bottomRef.current?.offsetHeight ?? 120,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const halfBtn = isMobile ? 18 : 12;
  const collapseBtnStyle: CSSProperties = (() => {
    if (btnPos === "top") return { top: measured.top - halfBtn, bottom: "auto", transform: "none" };
    if (btnPos === "bottom")
      return { top: window.innerHeight - measured.bottom - halfBtn, bottom: "auto", transform: "none" };
    return { top: "50%", bottom: "auto", transform: "translateY(-50%)" };
  })();

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => setBtnPos((e as CustomEvent<"top" | "middle" | "bottom">).detail);
    window.addEventListener("adminBtnPosChange", handler);
    return () => window.removeEventListener("adminBtnPosChange", handler);
  }, []);

  const isFlyoutMode = collapsed || (isMobile && !isOpen);

  useEffect(() => {
    if (!isFlyoutMode && LOG_PATHS.some((p) => location.pathname.startsWith(p))) {
      setLogsOpen(true);
    }
  }, [location.pathname, isFlyoutMode]);

  useEffect(() => {
    if (collapsed) setLogsOpen(false);
  }, [collapsed]);

  useEffect(() => {
    if (isMobile && !isOpen) setLogsOpen(false);
  }, [isMobile, isOpen]);

  // Close flyout on outside tap — more reliable than onBlur on iOS
  useEffect(() => {
    if (!logsOpen || !isFlyoutMode) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (!flyoutListRef.current?.contains(target) && !groupBtnRef.current?.contains(target)) {
        setLogsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [logsOpen, isFlyoutMode]);

  // Autofocus first item on desktop keyboard navigation
  useEffect(() => {
    if (logsOpen && !isMobile) firstChildRef.current?.focus();
  }, [logsOpen, isMobile]);

  const isActive = (to: string, exact: boolean) =>
    exact ? location.pathname === to : location.pathname.startsWith(to);

  const handleGroupClick = () => {
    if (!logsOpen && isFlyoutMode && groupBtnRef.current) {
      setFlyoutTop(groupBtnRef.current.getBoundingClientRect().top);
    }
    setLogsOpen((v) => !v);
  };

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
          <ul className={styles.navList}>
            {NAV.map((item) => {
              if (isGroup(item)) {
                const anyChildActive = item.children.some((c) => location.pathname.startsWith(c.to));
                return (
                  <li key={item.label} className={styles.groupItem}>
                    <button
                      ref={groupBtnRef}
                      type="button"
                      className={`${styles.groupBtn} ${anyChildActive ? styles.groupActive : ""}`}
                      onClick={handleGroupClick}
                      title={collapsed ? item.label : undefined}
                      aria-expanded={logsOpen}
                    >
                      <span className={styles.icon}>
                        <item.Icon />
                      </span>
                      <span className={styles.label}>{item.label}</span>
                      <span className={`${styles.groupChevron} ${logsOpen ? styles.groupChevronOpen : ""}`}>
                        <ChevronDownSmIcon />
                      </span>
                    </button>
                    <ul
                      ref={flyoutListRef}
                      className={`${styles.groupChildren} ${logsOpen ? styles.groupChildrenOpen : ""}`}
                      style={isFlyoutMode ? ({ "--flyout-top": `${flyoutTop}px` } as React.CSSProperties) : undefined}
                    >
                      {item.children.map((child, i) => {
                        const active = location.pathname.startsWith(child.to);
                        return (
                          <li key={child.to}>
                            <Link
                              ref={i === 0 ? firstChildRef : undefined}
                              to={child.to}
                              className={`${styles.childLink} ${active ? styles.active : ""}`}
                              aria-current={active ? "page" : undefined}
                              tabIndex={logsOpen ? undefined : -1}
                              onClick={() => {
                                setLogsOpen(false);
                                onClose();
                              }}
                            >
                              <span className={styles.icon}>
                                <child.Icon />
                              </span>
                              <span className={styles.label}>{child.label}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              }

              const active = isActive(item.to, item.exact);
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className={`${styles.navLink} ${active ? styles.active : ""}`}
                    aria-current={active ? "page" : undefined}
                    title={collapsed || !isOpen ? item.label : undefined}
                    onClick={onClose}
                  >
                    <span className={styles.icon}>
                      <item.Icon />
                    </span>
                    <span className={styles.label}>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
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
              <a href="https://clarity.app" target="_blank" rel="noopener noreferrer" className={styles.brandingLink}>
                Clarity
              </a>
              {" · "}
              <span className={styles.version}>v{__APP_VERSION__}</span>
            </span>
          </div>
        </div>

        <button
          type="button"
          className={styles.collapseBtn}
          style={collapseBtnStyle}
          onClick={onToggle}
          aria-label={isOpen || !collapsed ? "Collapse sidebar" : "Expand sidebar"}
          aria-expanded={isOpen || !collapsed}
        >
          {(isMobile ? !isOpen : collapsed) ? <ChevronRightIcon /> : <ChevronLeftIcon />}
        </button>
      </aside>

      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
    </>
  );
}
