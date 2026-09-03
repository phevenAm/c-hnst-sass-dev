import type { ReactNode } from "react";

import styles from "./StatTile.module.scss";

type Props = {
  label: string;
  /** The big figure. Strings render with tabular numerals for column alignment. */
  value: ReactNode;
  /** Optional caption under the value. */
  sub?: ReactNode;
  /** `danger` tints the value red, `accent` tints it with the brand accent. */
  tone?: "default" | "danger" | "accent";
  /** When set, the whole tile becomes a button. */
  onClick?: () => void;
  className?: string;
};

// One consistent metric card — used for the Finances tiles, and anywhere else a
// label + big number belongs. Typography is pinned to the sans stack so it
// never inherits a serif from a parent, and every value uses tabular numerals
// so figures line up across a row.
export default function StatTile({ label, value, sub, tone = "default", onClick, className }: Props) {
  const valueClass = [styles.value, tone === "danger" && styles.danger, tone === "accent" && styles.accent]
    .filter(Boolean)
    .join(" ");

  const body = (
    <>
      <span className={styles.label}>{label}</span>
      <span className={valueClass}>{value}</span>
      {sub != null && sub !== "" && <span className={styles.sub}>{sub}</span>}
    </>
  );

  const rootClass = [styles.tile, onClick && styles.clickable, className].filter(Boolean).join(" ");

  if (onClick) {
    return (
      <button type="button" className={rootClass} onClick={onClick}>
        {body}
      </button>
    );
  }
  return <div className={rootClass}>{body}</div>;
}
