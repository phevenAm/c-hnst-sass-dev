import styles from "./CountBadge.module.scss";

type Props = {
  count: number;
  /** Cap the displayed number; anything above shows as `{max}+`. Default 9. */
  max?: number;
  /** Screen-reader label. Default "{count} unread". */
  label?: string;
  className?: string;
};

/**
 * A small circular unread-count pill — the red dot with a number that rides an
 * icon or a nav item. Distinct from <Badge>, which is a text status pill.
 * Renders nothing at 0. The parent positions it (usually `position: absolute`).
 */
export default function CountBadge({ count, max = 9, label, className = "" }: Props) {
  if (count <= 0) return null;
  const text = count > max ? `${max}+` : String(count);
  return (
    <span className={`${styles.badge} ${className}`} aria-label={label ?? `${count} unread`}>
      {text}
    </span>
  );
}
