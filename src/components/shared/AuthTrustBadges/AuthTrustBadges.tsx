import { ShieldHeartIcon, ShieldKeyIcon, ShieldSproutIcon } from "@components/shared/Icons/Icons";

import styles from "./AuthTrustBadges.module.scss";

const BADGES = [
  { Icon: ShieldKeyIcon, title: "Private & secure", body: "Your data is always protected" },
  { Icon: ShieldHeartIcon, title: "Therapist approved", body: "Trusted by professionals" },
  { Icon: ShieldSproutIcon, title: "Made for you", body: "Tools to support your growth" },
] as const;

export default function AuthTrustBadges() {
  return (
    <ul className={styles.list}>
      {BADGES.map(({ Icon, title, body }) => (
        <li key={title} className={styles.item}>
          <span className={styles.iconWrap}>
            <Icon />
          </span>
          <span className={styles.text}>
            <span className={styles.title}>{title}</span>
            <span className={styles.body}>{body}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
