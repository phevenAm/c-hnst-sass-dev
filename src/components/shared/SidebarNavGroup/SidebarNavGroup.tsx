import { type ComponentType, type CSSProperties, useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";

import { ChevronDownSmIcon } from "@components/shared/Icons/Icons";

import styles from "./SidebarNavGroup.module.scss";

export type SidebarNavLeaf = { to: string; label: string; Icon: ComponentType };

/**
 * Class names each host sidebar (AdminSidebar / AgencyLayout) passes in so the
 * group looks native to it. Behaviour is shared; styling stays local.
 */
export type SidebarNavGroupClasses = {
  /** wrapper — MUST be `position: relative` so the collapsed flyout anchors. */
  group: string;
  /** parent row container (holds the link + chevron, or just the button). */
  row: string;
  rowActive: string;
  /** single toggle button — used when the group has no `to` of its own. */
  button?: string;
  /** parent link — used when the group has a `to` (a separate chevron toggles). */
  link?: string;
  /** the chevron toggle button (only when `link` is used). */
  toggle?: string;
  icon: string;
  label: string;
  chevron: string;
  chevronOpen: string;
  /** children container: `max-height` accordion inline, fixed popover in flyout. */
  children: string;
  childrenOpen: string;
  childLink: string;
  childActive: string;
};

type Props = {
  label: string;
  Icon: ComponentType;
  items: SidebarNavLeaf[];
  /** When set the parent row navigates here and a separate chevron toggles. */
  to?: string;
  parentActive: boolean;
  isItemActive: (to: string) => boolean;
  /** Children float as a fixed popover anchored to the row — collapsed desktop
   *  rail or the mobile icon strip. Otherwise an inline accordion. */
  flyoutMode: boolean;
  /** Open the flyout on hover / focus (real pointer on a collapsed desktop
   *  rail). Off for touch, where a synthesised mouseenter fights the tap. */
  hoverIntent: boolean;
  /** Keep the inline accordion open (e.g. a child route is active). */
  forceOpen?: boolean;
  /** Native tooltip on the collapsed rows. */
  showTitle?: boolean;
  onNavigate?: () => void;
  cx: SidebarNavGroupClasses;
};

export default function SidebarNavGroup({
  label,
  Icon,
  items,
  to,
  parentActive,
  isItemActive,
  flyoutMode,
  hoverIntent,
  forceOpen = false,
  showTitle = false,
  onNavigate,
  cx,
}: Props) {
  const [open, setOpen] = useState(forceOpen);
  const [flyoutTop, setFlyoutTop] = useState(0);
  const rowRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);

  const shown = flyoutMode ? open : forceOpen || open;

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  // Collapsing the rail / leaving mobile-open drops a stale flyout.
  useEffect(() => {
    if (!flyoutMode) setOpen(false);
  }, [flyoutMode]);

  const measure = () => {
    if (rowRef.current) setFlyoutTop(rowRef.current.getBoundingClientRect().top);
  };
  const openFlyout = () => {
    window.clearTimeout(closeTimer.current);
    measure();
    setOpen(true);
  };
  // Grace period so the pointer can cross the gap from rail to popover.
  const scheduleClose = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 180);
  };
  const toggle = () => {
    if (!open && flyoutMode) measure();
    setOpen((v) => !v);
  };

  // Outside-tap closes the floating popover.
  useEffect(() => {
    if (!shown || !flyoutMode) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (!listRef.current?.contains(t) && !rowRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [shown, flyoutMode]);

  const hoverProps = hoverIntent
    ? {
        onMouseEnter: openFlyout,
        onMouseLeave: scheduleClose,
        onFocus: openFlyout,
        onBlur: (e: React.FocusEvent<HTMLElement>) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
        },
      }
    : {};

  const chevron = (
    <span className={`${cx.chevron} ${shown ? cx.chevronOpen : ""}`}>
      <ChevronDownSmIcon />
    </span>
  );

  // Flyout mode is a popover owned entirely by this component's SCSS — the
  // host's accordion classes (max-height:0 etc.) would fight it. Inline mode
  // uses the host classes so it looks native.
  const childrenCx = flyoutMode
    ? `${styles.flyout} ${shown ? styles.flyoutOpen : ""}`
    : `${cx.children} ${shown ? cx.childrenOpen : ""}`;

  return (
    <div className={cx.group} {...hoverProps}>
      <div ref={rowRef} className={`${cx.row} ${parentActive ? cx.rowActive : ""}`}>
        {to ? (
          <>
            <NavLink to={to} className={cx.link} title={showTitle ? label : undefined} onClick={onNavigate}>
              <span className={cx.icon}>
                <Icon />
              </span>
              <span className={cx.label}>{label}</span>
            </NavLink>
            <button
              type="button"
              className={cx.toggle}
              aria-expanded={shown}
              aria-label={shown ? `Collapse ${label}` : `Expand ${label}`}
              onClick={toggle}
            >
              {chevron}
            </button>
          </>
        ) : (
          <button
            type="button"
            className={cx.button}
            onClick={toggle}
            title={showTitle ? label : undefined}
            aria-expanded={shown}
          >
            <span className={cx.icon}>
              <Icon />
            </span>
            <span className={cx.label}>{label}</span>
            {chevron}
          </button>
        )}
      </div>

      {/* biome-ignore lint/a11y/noStaticElementInteractions: keeps the flyout open while the pointer is over it; keyboard uses focus/blur on the group */}
      <div
        ref={listRef}
        className={childrenCx}
        style={flyoutMode ? ({ "--flyout-top": `${flyoutTop}px` } as CSSProperties) : undefined}
        onMouseEnter={hoverIntent ? openFlyout : undefined}
        onMouseLeave={hoverIntent ? scheduleClose : undefined}
      >
        {items.map((child) => {
          const active = isItemActive(child.to);
          return (
            <Link
              key={child.to}
              to={child.to}
              tabIndex={shown ? undefined : -1}
              title={showTitle ? child.label : undefined}
              aria-current={active ? "page" : undefined}
              className={`${cx.childLink} ${flyoutMode ? styles.flyoutItem : ""} ${active ? cx.childActive : ""}`}
              onClick={() => {
                setOpen(false);
                onNavigate?.();
              }}
            >
              <span className={cx.icon}>
                <child.Icon />
              </span>
              <span className={cx.label}>{child.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
