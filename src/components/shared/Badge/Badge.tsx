import styles from "./Badge.module.scss";

type BadgeVariant = "success" | "warning" | "danger" | "neutral";

type BadgeProps = {
  variant: BadgeVariant;
  children: React.ReactNode;
};

const Badge = ({ variant, children }: BadgeProps) => (
  <span className={`${styles.badge} ${styles[variant]}`}>{children}</span>
);

export default Badge;
