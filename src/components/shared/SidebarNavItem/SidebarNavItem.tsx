import type { ComponentType, CSSProperties } from "react";
import { NavLink } from "react-router-dom";

import styles from "./SidebarNavItem.module.scss";

/** Class names the host sidebar supplies for the *un*selected look — padding,
 *  hover, the icon/label spans. The selected treatment is owned here so admin
 *  and agency stay in lock-step. */
export type SidebarNavItemClasses = {
  link: string;
  icon: string;
  label: string;
};

type Props = {
  to: string;
  label: string;
  Icon: ComponentType;
  end?: boolean;
  /** Rail collapsed → show a native tooltip (the label is visually hidden). */
  showTitle?: boolean;
  onNavigate?: () => void;
  /** Override the selected background/text — e.g. `"var(--accent-subtle)"`.
   *  Pass `[bg, fg]`; omit for the shared default (`--accent-secondary`). */
  accent?: [bg: string, fg: string];
  cx: SidebarNavItemClasses;
};

export default function SidebarNavItem({ to, label, Icon, end, showTitle, onNavigate, accent, cx }: Props) {
  const style = accent
    ? ({ "--nav-selected-bg": accent[0], "--nav-selected-fg": accent[1] } as CSSProperties)
    : undefined;

  return (
    <NavLink
      to={to}
      end={end}
      title={showTitle ? label : undefined}
      onClick={onNavigate}
      style={style}
      className={({ isActive }) => `${cx.link} ${isActive ? styles.selected : ""}`}
    >
      <span className={cx.icon}>
        <Icon />
      </span>
      <span className={cx.label}>{label}</span>
    </NavLink>
  );
}
