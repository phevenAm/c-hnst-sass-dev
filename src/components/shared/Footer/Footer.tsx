import { HelpIcon } from "../Icons/Icons";

import styles from "./Footer.module.scss";

/**
 * Slim client-facing footer, rendered by AppLayout. Shows the app version and a
 * link through to the dedicated Help & support page (crisis lines, tel: links).
 * Opens in a new tab so a client in distress never loses their place in the
 * portal — and it still works if the app is running as an installed PWA.
 */
export default function Footer() {
  return (
    <footer className={styles.footer}>
      <span className={styles.brand}>
        <em>Clarity</em>
        <span className={styles.version}>v{__APP_VERSION__}</span>
      </span>

      <a href="/help" target="_blank" rel="noopener noreferrer" className={styles.helpLink}>
        <HelpIcon />
        Help &amp; support
      </a>
    </footer>
  );
}
