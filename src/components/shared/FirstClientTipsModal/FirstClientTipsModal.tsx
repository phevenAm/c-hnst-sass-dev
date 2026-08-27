import { Link } from "react-router-dom";

import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";

import styles from "./FirstClientTipsModal.module.scss";

type Props = {
  onClose: () => void;
};

const TIPS = [
  {
    title: "Session-prep reminders",
    body: "A nudge before each of your sessions, so you can glance over the client's history first.",
    cta: "Practice settings",
  },
  {
    title: "Auto-cancel unpaid sessions",
    body: "Let a session fall away on its own if it hasn't been paid by a deadline you set.",
    cta: "Practice settings",
  },
  {
    title: "Client onboarding contract",
    body: "Ask new clients to agree to your terms before they can use the app. Skip it if that's not your thing.",
    cta: "Practice settings",
  },
];

export default function FirstClientTipsModal({ onClose }: Props) {
  return (
    <Modal
      title="Your first client is set up"
      onClose={onClose}
      size="sm"
      actions={
        <Button variant="primary" onClick={onClose}>
          Got it
        </Button>
      }
    >
      <div className={styles.celebrate}>
        <span className={styles.badge} aria-hidden="true">
          🎉
        </span>
        <p>
          Nice work — that's the setup done. You're ready to book sessions, keep notes, track payments, and send
          check-in forms.
        </p>
      </div>

      <p className={styles.intro}>A few optional extras you can switch on whenever they'd help — tap one to open it.</p>

      <ul className={styles.tipList}>
        {TIPS.map((tip) => (
          <li key={tip.title}>
            <Link to="/settings?tab=practice" onClick={onClose} className={styles.tip}>
              <strong>{tip.title}</strong>
              <p>{tip.body}</p>
              <span className={styles.location}>{tip.cta} →</span>
            </Link>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
