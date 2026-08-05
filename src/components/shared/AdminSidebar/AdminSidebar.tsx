import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { useAuth } from "@context/AuthContext";

import { supabase } from "@/lib/supabase.js";
import FeedbackModal from "../FeedbackModal/FeedbackModal";
import {
  ArticleIcon,
  BookIcon,
  CalendarIcon,
  ChatIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardIcon,
  HistoryIcon,
  HomeIcon,
  LogoIcon,
  SidebarCardIcon,
  UsersIcon,
} from "../Icons/Icons";

import styles from "./AdminSidebar.module.scss";

const NAV = [
  { to: "/admin", label: "Dashboard", Icon: HomeIcon, exact: true },
  { to: "/admin/clients", label: "Clients", Icon: UsersIcon, exact: false },
  { to: "/admin/scheduler", label: "Schedule", Icon: CalendarIcon, exact: false },
  { to: "/admin/payments", label: "Payments", Icon: SidebarCardIcon, exact: false },
  { to: "/admin/questionnaires", label: "Check-ins", Icon: ClipboardIcon, exact: false },
  { to: "/admin/resources", label: "Resources", Icon: BookIcon, exact: false },
  { to: "/admin/cpd", label: "CPD Log", Icon: ArticleIcon, exact: false },
];

export default function AdminSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const location = useLocation();
  const { isDemo } = useAuth();
  const [practiceLogoUrl, setPracticeLogoUrl] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useEffect(() => {
    supabase
      .from("practice_settings")
      .select("logo_url")
      .limit(1)
      .single()
      .then(({ data }) => setPracticeLogoUrl(data?.logo_url ?? null));
  }, []);

  const isActive = (to: string, exact: boolean) =>
    exact ? location.pathname === to : location.pathname.startsWith(to);

  return (
    <>
      <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ""}`} aria-label="Admin navigation">
        <div className={styles.top}>
          <Link to="/admin" className={styles.logo} aria-label="WithMe Admin — home">
            <div className={styles.logoMark}>
              {practiceLogoUrl ? <img src={practiceLogoUrl} alt="" /> : <LogoIcon />}
            </div>
            <span className={styles.logoText}>WithMe</span>
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
                    title={collapsed ? label : undefined}
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

        <div className={styles.bottom}>
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

          <Link to="/admin/audit-logs" className={styles.bottomLink} title={collapsed ? "Activity log" : undefined}>
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
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
        </button>
      </aside>

      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
    </>
  );
}
