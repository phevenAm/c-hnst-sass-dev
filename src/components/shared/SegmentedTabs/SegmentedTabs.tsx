import styles from "./SegmentedTabs.module.scss";

export type SegmentedTab<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  tabs: readonly SegmentedTab<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Labels the group for assistive tech, e.g. "Session list scope". */
  ariaLabel: string;
  /** Stretch to fill the container, each tab an equal share. */
  fullWidth?: boolean;
};

/**
 * The pill tab-switch used across session lists (Upcoming / Past / All …).
 * Generalises ToggleButtonTabs (which is fixed at two) to any number of tabs,
 * keeping the same look.
 */
export default function SegmentedTabs<T extends string>({ tabs, value, onChange, ariaLabel, fullWidth }: Props<T>) {
  return (
    <div className={`${styles.tabs} ${fullWidth ? styles.fullWidth : ""}`.trim()} role="tablist" aria-label={ariaLabel}>
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          className={value === t.value ? styles.tabActive : styles.tab}
          onClick={() => onChange(t.value)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
