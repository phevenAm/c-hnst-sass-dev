import { useState } from "react";
import { Link } from "react-router-dom";

import { CloseIcon } from "@components/shared/Icons/Icons";

import styles from "./MessagingNotice.module.scss";

const LS_KEY = "messaging_notice_dismissed";

const dismissed = () => {
  try {
    return localStorage.getItem(LS_KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * One-time, dismissible reminder shown inside the chat that messages aren't the
 * place for sensitive things. The binding terms live in the ToS / Privacy
 * Policy; this is a courtesy nudge at the point of use. Per-browser dismissal.
 */
export default function MessagingNotice({ audience }: { audience: "admin" | "client" }) {
  const [hidden, setHidden] = useState(dismissed);
  if (hidden) return null;

  return (
    <div className={styles.notice} role="note">
      <p className={styles.text}>
        {audience === "client" ? (
          <>
            Messages are for practical things like scheduling. They're stored securely but{" "}
            <strong>aren't end-to-end encrypted</strong> — please don't share anything here you'd only want to discuss
            in a session. In a crisis, see <Link to="/help">Help &amp; support</Link>.
          </>
        ) : (
          <>
            Use messages for logistics — clinical disclosures belong in session notes. Messages are stored securely but{" "}
            <strong>aren't end-to-end encrypted</strong>. Your clients see the same reminder.
          </>
        )}
      </p>
      <button
        type="button"
        className={styles.close}
        aria-label="Dismiss"
        onClick={() => {
          try {
            localStorage.setItem(LS_KEY, "1");
          } catch {
            /* ignore */
          }
          setHidden(true);
        }}
      >
        <CloseIcon />
      </button>
    </div>
  );
}
