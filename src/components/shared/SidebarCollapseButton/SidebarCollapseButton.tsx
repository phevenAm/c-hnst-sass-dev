import { type CSSProperties, type RefObject, useEffect, useLayoutEffect, useState } from "react";

import { ChevronLeftIcon, ChevronRightIcon } from "../Icons/Icons";

// The little round chevron that pokes out of a sidebar's right edge to
// collapse / expand it. Shared by AdminSidebar and AgencyLayout so the two
// behave identically: same top / middle / bottom vertical placement, driven by
// one preference, and the same collapse-on-desktop, overlay-on-mobile model.

export type SidebarBtnPos = "top" | "middle" | "bottom";

const STORAGE_KEY = "adminSidebarBtnPos"; // legacy name — now shared by both sidebars
export const SIDEBAR_BTN_POS_EVENT = "adminBtnPosChange";

export function readSidebarBtnPos(): SidebarBtnPos {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "top" || v === "middle" || v === "bottom") return v;
  } catch {
    /* private mode — fall through to the default */
  }
  return "top";
}

// Called from Settings → Interface. Persists the choice and tells every mounted
// sidebar to move its button now, without a reload.
export function writeSidebarBtnPos(pos: SidebarBtnPos) {
  try {
    localStorage.setItem(STORAGE_KEY, pos);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(SIDEBAR_BTN_POS_EVENT, { detail: pos }));
}

type Props = {
  /** Desktop: is the rail collapsed to icons. */
  collapsed: boolean;
  /** Mobile: is the overlay open. */
  isOpen: boolean;
  isMobile: boolean;
  onToggle: () => void;
  /** The sidebar's top (brand) block — anchors the "top" placement. */
  topRef: RefObject<HTMLElement | null>;
  /** The sidebar's bottom (footer) block — anchors the "bottom" placement. */
  bottomRef: RefObject<HTMLElement | null>;
  /** The host sidebar's own button style (edge poke-out, size, colours). */
  className: string;
};

export default function SidebarCollapseButton({
  collapsed,
  isOpen,
  isMobile,
  onToggle,
  topRef,
  bottomRef,
  className,
}: Props) {
  const [btnPos, setBtnPos] = useState<SidebarBtnPos>(readSidebarBtnPos);
  const [measured, setMeasured] = useState({ top: 55, bottom: 120 });

  // Re-measure on resize, and again whenever the rail collapses / expands — the
  // brand and footer blocks change height between the labelled and icon states,
  // which moves where the "top" / "bottom" anchors sit.
  // biome-ignore lint/correctness/useExhaustiveDependencies: collapsed/isOpen are re-run triggers, not values the closure reads
  useLayoutEffect(() => {
    const measure = () =>
      setMeasured({
        top: topRef.current?.offsetHeight ?? 55,
        bottom: bottomRef.current?.offsetHeight ?? 120,
      });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [topRef, bottomRef, collapsed, isOpen]);

  useEffect(() => {
    const handler = (e: Event) => setBtnPos((e as CustomEvent<SidebarBtnPos>).detail);
    window.addEventListener(SIDEBAR_BTN_POS_EVENT, handler);
    return () => window.removeEventListener(SIDEBAR_BTN_POS_EVENT, handler);
  }, []);

  const halfBtn = isMobile ? 18 : 12;
  const style: CSSProperties = (() => {
    if (btnPos === "top") return { top: measured.top - halfBtn, bottom: "auto", transform: "none" };
    if (btnPos === "bottom") {
      return { top: window.innerHeight - measured.bottom - halfBtn, bottom: "auto", transform: "none" };
    }
    return { top: "50%", bottom: "auto", transform: "translateY(-50%)" };
  })();

  const pointsRight = isMobile ? !isOpen : collapsed;

  return (
    <button
      type="button"
      className={className}
      style={style}
      onClick={onToggle}
      aria-label={isOpen || !collapsed ? "Collapse sidebar" : "Expand sidebar"}
      aria-expanded={isOpen || !collapsed}
    >
      {pointsRight ? <ChevronRightIcon /> : <ChevronLeftIcon />}
    </button>
  );
}
