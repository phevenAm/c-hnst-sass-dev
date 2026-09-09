import { type KeyboardEvent, useCallback, useEffect, useRef, useState, type WheelEvent } from "react";
import { useSearchParams } from "react-router-dom";

import { ChevronLeftIcon, ChevronRightIcon } from "@components/shared/Icons/Icons";

import styles from "./SettingsTabs.module.scss";

export type SettingsTabDef<Id extends string = string> = { id: Id; label: string };

type Props<Id extends string> = {
  /** Ordered tab definitions. `id` is the value handed back to `onChange`. */
  tabs: readonly SettingsTabDef<Id>[];
  /** Currently-selected tab id — owned by the parent page. */
  value: Id;
  /** Fired on click, keyboard nav, and a matching `?tab=` deep link. */
  onChange: (id: Id) => void;
  /** Accessible name for the tablist, e.g. "Settings sections". */
  ariaLabel: string;
  /**
   * Prefix for the DOM ids this renders:
   *   - tablist:       `${idBase}-tabs`          ← walkthrough + e2e target this
   *   - each tab:      `${idBase}-tab-${tabId}`
   *   - aria-controls: `${idBase}-panel-${tabId}` (the page owns the panel nodes)
   * Keep it stable per page.
   */
  idBase: string;
  /**
   * When set, the bar reads `?tab=<id>` on mount / URL change, fires `onChange`
   * for a match, then strips just the `tab` param — `section` etc. are left in
   * place for the page to consume. Default: true.
   */
  syncSearchParam?: boolean;
};

/**
 * The underline tab bar shared by the admin and agency settings pages. Renders
 * a proper `role="tablist"`, owns the `?tab=` URL sync, and scrolls
 * horizontally (arrows + wheel) when the labels overflow a narrow screen.
 */
export default function SettingsTabs<Id extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
  idBase,
  syncSearchParam = true,
}: Props<Id>) {
  const listRef = useRef<HTMLDivElement>(null);
  const [overflowLeft, setOverflowLeft] = useState(false);
  const [overflowRight, setOverflowRight] = useState(false);

  // ── ?tab= deep link ──────────────────────────────────────────
  // FirstClientTipsModal, ClientCapBanner, PlanLimitModal and CreateSessionModal
  // all navigate to `/settings?tab=<id>[&section=<id>]`. Consume `tab`, leave
  // everything else for the SettingsCard that owns `section` to act on.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (!syncSearchParam) return;
    const t = searchParams.get("tab");
    if (!t || !tabs.some((tab) => tab.id === t)) return;
    onChange(t as Id);
    const next = new URLSearchParams(searchParams);
    next.delete("tab");
    setSearchParams(next, { replace: true });
  }, [syncSearchParam, searchParams, setSearchParams, tabs, onChange]);

  // ── overflow affordances ─────────────────────────────────────
  // The native scrollbar is hidden, so on a narrow screen there's no hint the
  // list scrolls. Show an arrow only on the side that still has clipped tabs.
  const measure = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setOverflowLeft(el.scrollLeft > 1);
    setOverflowRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  // Keep the active tab in view when it changes from outside the bar (deep
  // link, or a "jump to settings" button on a panel).
  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>(`[id="${idBase}-tab-${value}"]`);
    active?.scrollIntoView({ block: "nearest", inline: "nearest" });
    measure();
  }, [value, idBase, measure]);

  const scrollByStep = (dir: 1 | -1) => {
    listRef.current?.scrollBy({ left: dir * 160, behavior: "smooth" });
  };

  // A plain mouse wheel is vertical; translate it to horizontal so mouse users
  // can reach clipped tabs without the arrows.
  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    const el = listRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    el.scrollLeft += e.deltaY;
    measure();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = tabs.findIndex((t) => t.id === value);
    let nextIdx: number | null = null;
    if (e.key === "ArrowRight") nextIdx = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft") nextIdx = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = tabs.length - 1;
    if (nextIdx === null || nextIdx === idx) return;
    e.preventDefault();
    onChange(tabs[nextIdx].id);
    e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[nextIdx]?.focus();
  };

  return (
    <div className={styles.wrap}>
      {overflowLeft && (
        <button
          type="button"
          className={styles.arrow}
          onClick={() => scrollByStep(-1)}
          aria-label="Scroll tabs left"
          tabIndex={-1}
        >
          <ChevronLeftIcon />
        </button>
      )}
      <div
        ref={listRef}
        id={`${idBase}-tabs`}
        className={styles.list}
        role="tablist"
        aria-label={ariaLabel}
        aria-orientation="horizontal"
        onScroll={measure}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
      >
        {tabs.map((tab) => {
          const selected = tab.id === value;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`${idBase}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${idBase}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              className={`${styles.tab} ${selected ? styles.tabActive : ""}`}
              onClick={() => onChange(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {overflowRight && (
        <button
          type="button"
          className={styles.arrow}
          onClick={() => scrollByStep(1)}
          aria-label="Scroll tabs right"
          tabIndex={-1}
        >
          <ChevronRightIcon />
        </button>
      )}
    </div>
  );
}
