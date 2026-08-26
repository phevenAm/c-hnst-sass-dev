import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";

import styles from "./FirstClientTipsModal.module.scss";

type Props = {
  onClose: () => void;
};

const TIPS = [
  {
    title: "Session-prep reminders",
    body: "Get an in-app notification before your own sessions so you can review a client's history first.",
    location: "Settings → Practice → Session-prep reminders",
  },
  {
    title: "Auto-cancel unpaid sessions",
    body: "Automatically cancel a session if it isn't paid by a deadline you choose.",
    location: "Settings → Practice → Session automation",
  },
  {
    title: "Client onboarding contract",
    body: "Only if you want one — not everyone will. Ask new clients to agree to a contract before using the app.",
    location: "Settings → Practice → Client consent",
  },
];

export default function FirstClientTipsModal({ onClose }: Props) {
  return (
    <Modal
      title="You've added your first client"
      onClose={onClose}
      size="sm"
      actions={
        <Button variant="primary" onClick={onClose}>
          Got it
        </Button>
      }
    >
      <p className={styles.intro}>
        A few things worth a look now that you're up and running — all optional, all live in Settings whenever you want
        them.
      </p>
      <ul className={styles.tipList}>
        {TIPS.map((tip) => (
          <li key={tip.title} className={styles.tip}>
            <strong>{tip.title}</strong>
            <p>{tip.body}</p>
            <span className={styles.location}>{tip.location}</span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
