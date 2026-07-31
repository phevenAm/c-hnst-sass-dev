import { type ReactNode, useState } from "react";

import { ChevronDown } from "../Icons/Icons";

import styles from "./CollapsibleSection.module.scss";

// Reads the persisted open/closed state for a section. Falls back to
// `defaultOpen` when nothing is stored yet (or storage is unavailable).
const readStored = (storageKey: string, defaultOpen: boolean): boolean => {
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw === null ? defaultOpen : raw === "1";
  } catch {
    return defaultOpen;
  }
};

interface CollapsibleSectionProps {
  title: string;
  /** localStorage key — collapse state persists across route changes + reloads. */
  storageKey: string;
  defaultOpen?: boolean;
  /** Optional content pinned to the right of the header (stays visible when collapsed). */
  headerRight?: ReactNode;
  children: ReactNode;
}

export default function CollapsibleSection({
  title,
  storageKey,
  defaultOpen = true,
  headerRight,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(() => readStored(storageKey, defaultOpen));

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* ignore write failures (private mode etc.) */
      }
      return next;
    });
  };

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <button type="button" className={styles.toggle} onClick={toggle} aria-expanded={open}>
          <span className={`${styles.chevron} ${open ? styles.open : ""}`} aria-hidden="true">
            <ChevronDown />
          </span>
          <h2 className={styles.title}>{title}</h2>
        </button>
        {headerRight && <div className={styles.headerRight}>{headerRight}</div>}
      </div>
      {open && <div className={styles.body}>{children}</div>}
    </section>
  );
}
