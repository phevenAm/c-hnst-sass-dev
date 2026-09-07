import styles from "./NotificationBadge.module.scss";

type NotificationBadgeProps = {
  number?: number;
  text?: string;
  color?: string;
};

export default function NotificationBadge({ number, text, color = "var(--danger)" }: NotificationBadgeProps) {
  const content = text ?? (number === undefined ? "" : String(number));
  if (!content) return null;

  return (
    <span
      className={`${styles.badge} ${content.length > 2 ? styles.pill : styles.circle}`}
      style={{ backgroundColor: color }}
      role="status"
      aria-label={`${content} notifications`}
    >
      {content}
    </span>
  );
}
