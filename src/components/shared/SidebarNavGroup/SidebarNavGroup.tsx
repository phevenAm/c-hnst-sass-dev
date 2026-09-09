import { type ComponentType, type CSSProperties, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { ChevronDownSmIcon } from "@components/shared/Icons/Icons";
import itemStyles from "@components/shared/SidebarNavItem/SidebarNavItem.module.scss";

import styles from "./SidebarNavGroup.module.scss";

export type SidebarNavLeaf = { to: string; label: string; Icon: ComponentType };

/**
 * Class names each host sidebar (AdminSidebar / AgencyLayout) passes in so the
 * group looks native to it. Behaviour is shared; styling stays local.
 */
export type SidebarNavGroupClasses = {
  /** wrapper — MUST be `position: relative` so the collapsed flyout anchors. */
  group: string;
  /** the parent row — pass the SAME class a plain item uses, so the row's
   *  hover / selected fill is one box, identical to every other nav row. */
  row: string;
  /** optional host-specific tweak on the selected parent row. The selected
   *  colour itself is owned by the shared component. */
  rowActive?: string;
  icon: string;
  label: string;
  chevron: string;
  chevronOpen: string;
  /** children container: `max-height` accordion inline, fixed popover in flyout. */
  children: string;
  childrenOpen: string;
  childLink: string;
  childActive?: string;
};

type Props = {
  label: string;
  Icon: ComponentType;
  /** Leaves shown under the group. A group with a landing page of its own
   *  passes it as the first leaf (e.g. "All clients") — the parent row is a
   *  pure disclosure toggle, never a link. */
  items: SidebarNavLeaf[];
  /** The parent row itself is the current page (rare — usually a child is). */
  parentActive: boolean;
  isItemActive: (to: string) => boolean;
  /** Children float as a fixed popover anchored to the row — collapsed desktop
   *  rail or the mobile icon strip. Otherwise an inline accordion. */
  flyoutMode: boolean;
  /** Open the flyout on hover / focus (real pointer on a collapsed desktop
   *  rail). Off for touch, where a synthesised mouseenter fights the tap. */
  hoverIntent: boolean;
  /** Force the inline accordion open regardless of the active child. */
  forceOpen?: boolean;
  /** Native tooltip on the collapsed rows. */
  showTitle?: boolean;
  /** Override the shared selected background/text — `[bg, fg]`. */
  accent?: [bg: string, fg: string];
  onNavigate?: () => void;
  cx: SidebarNavGroupClasses;
};

export default function SidebarNavGroup({
  label,
  Icon,
  items,
  parentActive,
  isItemActive,
  flyoutMode,
  hoverIntent,
  forceOpen = false,
  showTitle = false,
  accent,
  onNavigate,
  cx,
}: Props) {
  const accentStyle = accent
    ? ({ "--nav-selected-bg": accent[0], "--nav-selected-fg": accent[1] } as CSSProperties)
    : undefined;

  const hasActiveChild = items.some((child) => isItemActive(child.to));

  const [open, setOpen] = useState(() => !flyoutMode && (forceOpen || hasActiveChild));
  const [flyoutTop, setFlyoutTop] = useState(0);
  const rowRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  // Expanded rail → the accordion follows the route: it springs open onto the
  // active child (or when the host forces it) and the user can still toggle it
  // shut. Collapsing to a rail drops whatever popover was left open.
  useEffect(() => {
    if (flyoutMode) setOpen(false);
    else if (forceOpen || hasActiveChild) setOpen(true);
  }, [flyoutMode, forceOpen, hasActiveChild]);

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
  // The whole parent row: expanded → toggle the accordion; collapsed → open /
  // close the flyout popover.
  const toggle = () => {
    if (!open && flyoutMode) measure();
    setOpen((v) => !v);
  };

  // Outside-tap closes the floating popover.
  useEffect(() => {
    if (!open || !flyoutMode) return;
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
  }, [open, flyoutMode]);

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

  // Full selected fill on the parent row only when it can't defer to a visible
  // child: it's the page itself, or a child is active but out of sight — the
  // accordion is a collapsed rail (flyout), or the user has collapsed the
  // inline accordion shut while still on one of its pages.
  const rowSelected = parentActive || (hasActiveChild && (flyoutMode || !open));

  // Flyout mode is a popover owned entirely by this component's SCSS — the
  // host's accordion classes (max-height:0 etc.) would fight it. Inline mode
  // uses the host classes so it looks native.
  const childrenCx = flyoutMode
    ? `${styles.flyout} ${open ? styles.flyoutOpen : ""}`
    : `${cx.children} ${open ? cx.childrenOpen : ""}`;

  return (
    <div className={cx.group} style={accentStyle} {...hoverProps}>
      <button
        ref={rowRef}
        type="button"
        className={`${cx.row} ${rowSelected ? `${cx.rowActive ?? ""} ${itemStyles.selected}` : ""}`}
        onClick={toggle}
        title={showTitle ? label : undefined}
        aria-expanded={open}
      >
        <span className={cx.icon}>
          <Icon />
        </span>
        <span className={cx.label}>{label}</span>
        <span className={`${cx.chevron} ${open ? cx.chevronOpen : ""}`}>
          <ChevronDownSmIcon />
        </span>
      </button>

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
              tabIndex={open ? undefined : -1}
              title={showTitle ? child.label : undefined}
              aria-current={active ? "page" : undefined}
              className={`${cx.childLink} ${flyoutMode ? styles.flyoutItem : ""} ${
                active ? `${cx.childActive ?? ""} ${itemStyles.selected}` : ""
              }`}
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
