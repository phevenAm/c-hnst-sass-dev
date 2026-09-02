import type { ReactNode } from "react";

import styles from "./NewTabLink.module.scss";

type Props = {
  href: string;
  children: ReactNode;
  className?: string;
};

/**
 * Anchor that opens in a new browser tab with a visible ↗ marker and a
 * screen-reader "(opens in new tab)" hint. Use for links to standalone
 * reference pages (Terms, Privacy, Security) so the reader keeps their place.
 */
export default function NewTabLink({ href, children, className }: Props) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      <span className={styles.icon} aria-hidden="true">
        ↗
      </span>
      <span className={styles.srOnly}> (opens in new tab)</span>
    </a>
  );
}
