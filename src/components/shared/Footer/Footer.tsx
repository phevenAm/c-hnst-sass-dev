import { Link } from "react-router-dom";

import { HelpIcon } from "../Icons/Icons";

import styles from "./Footer.module.scss";

/**
 * Slim client-facing footer, rendered by AppLayout. Shows the app version and a
 * prominent link through to the dedicated Help & support page (crisis lines,
 * tel: links). That page has its own "Back to portal" link, so this navigates
 * in-app rather than opening a new tab.
 */
export default function Footer() {
  return (
    <footer className={styles.footer}>
      <span className={styles.brand}>
        <em>Clarity</em>
        <span className={styles.version}>v{__APP_VERSION__}</span>
      </span>

      <Link to="/help" className={styles.helpLink}>
        <HelpIcon />
        Help &amp; support
      </Link>
    </footer>
  );
}
