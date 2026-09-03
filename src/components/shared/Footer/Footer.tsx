import { Link } from "react-router-dom";

import { HelpIcon } from "../Icons/Icons";

import styles from "./Footer.module.scss";

/**
 * Slim client-facing footer, rendered by AppLayout. Shows the app version and a
 * link through to Resources, where every practice's pinned "Crisis & urgent
 * support" card lives.
 */
export default function Footer() {
  return (
    <footer className={styles.footer}>
      <span className={styles.brand}>
        <em>Clarity</em>
        <span className={styles.version}>v{__APP_VERSION__}</span>
      </span>

      <Link to="/resources" className={styles.helpLink}>
        <HelpIcon />
        Help &amp; support
      </Link>
    </footer>
  );
}
