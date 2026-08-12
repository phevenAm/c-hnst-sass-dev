import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../../context/AuthContext";
import FeedbackModal from "../FeedbackModal/FeedbackModal";

import styles from "./Footer.module.scss";

export default function Footer() {
  const { isAdmin } = useAuth();
  const [now, setNow] = useState(new Date());
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <footer className={styles.footer}>
      <span>
        <em>Abide:</em> WithMe
      </span>

      {isAdmin && (
        <div className={styles.right}>
          <button
            type="button"
            className={styles.feedbackBtn}
            onClick={() => setFeedbackOpen(true)}
            title="Report a bug or request a feature"
            aria-label="Report a bug or request a feature"
          >
            ?
          </button>
          <Link to="/admin/audit-logs" className={styles.auditLink}>
            {now.toLocaleString()}
          </Link>
        </div>
      )}

      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
    </footer>
  );
}
