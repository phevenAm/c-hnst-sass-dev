import type { ReactNode } from "react";

import styles from "./ThreeWayToggle.module.scss";

export type ThreeWayOption<T extends string> = {
  value: T;
  /** Accessible name for this position (also handy for a "current setting" caption). */
  label: string;
  /** Icon shown in the segment — it sits on the white knob when this option is active. */
  icon: ReactNode;
};

type Props<T extends string> = {
  options: readonly [ThreeWayOption<T>, ThreeWayOption<T>, ThreeWayOption<T>];
  value: T;
  onChange: (value: T) => void;
  /** Labels the whole control for assistive tech, e.g. "Appearance". */
  ariaLabel: string;
  className?: string;
};

/**
 * A three-position segmented switch. A white knob slides under the selected
 * segment and carries that option's icon; the other two icons sit dimmed on
 * the track. Generic over the option value type.
 */
export default function ThreeWayToggle<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className = "",
}: Props<T>) {
  const activeIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  return (
    <div
      className={`${styles.toggle} ${className}`.trim()}
      role="radiogroup"
      aria-label={ariaLabel}
      style={{ "--twt-index": activeIndex } as React.CSSProperties}
    >
      <span className={styles.knob} aria-hidden="true" />
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.label}
            className={`${styles.segment} ${active ? styles.segmentActive : ""}`}
            onClick={() => onChange(opt.value)}
          >
            <span className={styles.icon}>{opt.icon}</span>
          </button>
        );
      })}
    </div>
  );
}
