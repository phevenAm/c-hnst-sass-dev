import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { useAuth } from "@context/AuthContext";

import FeedbackModal from "../FeedbackModal/FeedbackModal";
import {
  ArticleIcon,
  BookIcon,
  CalendarIcon,
  ChatIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CpdIcon,
  FormsIcon,
  HistoryIcon,
  HomeIcon,
  LeafLogoMark,
  MoneyIcon,
  SupervisionLogoMark,
  UsersIcon,
} from "../Icons/Icons";

import styles from "./AdminSidebar.module.scss";

const NAV = [
  { to: "/admin", label: "Dashboard", Icon: HomeIcon, exact: true },
  { to: "/admin/scheduler", label: "Schedule", Icon: CalendarIcon, exact: false },
  { to: "/admin/clients", label: "Clients", Icon: UsersIcon, exact: false },
  { to: "/admin/payments", label: "Payments", Icon: MoneyIcon, exact: false },
  { to: "/admin/resources", label: "Resources", Icon: BookIcon, exact: false },
  { to: "/admin/forms", label: "Forms", Icon: FormsIcon, exact: false },
  { to: "/admin/cpd", label: "CPD Log", Icon: CpdIcon, exact: false },
  { to: "/admin/supervision", label: "Supervision", Icon: SupervisionLogoMark, exact: false },
];

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

  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
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

  const isActive = (to: string, exact: boolean) =>
    exact ? location.pathname === to : location.pathname.startsWith(to);

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
            {NAV.map(({ to, label, Icon, exact }) => {
              const active = isActive(to, exact);
              return (
                <li key={to}>
                  <Link
                    to={to}
                    className={`${styles.navLink} ${active ? styles.active : ""}`}
                    aria-current={active ? "page" : undefined}
                    title={collapsed || !isOpen ? label : undefined}
                    onClick={onClose}
                  >
                    <span className={styles.icon}>
                      <Icon />
                    </span>
                    <span className={styles.label}>{label}</span>
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
              title={collapsed ? "Report an issue" : undefined}
            >
              <span className={styles.icon}>
                <ChatIcon />
              </span>
              <span className={styles.label}>Report an issue</span>
            </button>
          )}

          <Link
            to="/admin/audit-logs"
            className={styles.bottomLink}
            title={collapsed ? "Activity log" : undefined}
            onClick={onClose}
          >
            <span className={styles.icon}>
              <HistoryIcon />
            </span>
            <span className={styles.label}>Activity log</span>
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

        {/* Collapse/expand arrow on the right edge of the sidebar */}
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
