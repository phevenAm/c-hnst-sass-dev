import { useEncryption } from "@context/EncryptionContext";

import styles from "./EncryptionStatusPill.module.scss";

const CONTENT: Record<
  "unlocked" | "locked" | "disabled",
  { className: string; title: string; ariaLabel: string; label: string }
> = {
  unlocked: {
    className: styles.encUnlocked,
    title: "Notes are encrypted and unlocked",
    ariaLabel: "Encryption: unlocked",
    label: "Encrypted",
  },
  locked: {
    className: styles.encLocked,
    title: "Notes are encrypted but locked — open a client's session notes to unlock",
    ariaLabel: "Encryption: locked",
    label: "Locked",
  },
  disabled: {
    className: styles.encDisabled,
    title: "Note encryption isn't set up — open any client's Account Summary or session notes to turn it on",
    ariaLabel: "Encryption: not set up",
    label: "Not encrypted",
  },
};

// Shown to admins in both nav bars (Navbar for the demo "view as client"
// edge case, AdminTopbar for the real admin experience). Encryption is
// entirely opt-in with no other always-visible indicator of whether it's
// even turned on — without this, an admin who never happens to open a
// client's Notes modal has no way to discover the feature exists at all,
// let alone whether their own notes are currently protected.
export function EncryptionStatusPill() {
  const { status } = useEncryption();
  if (status === "checking") return null;

  const content = CONTENT[status];
  return (
    <div
      className={`${styles.encPill} ${content.className}`}
      title={content.title}
      aria-label={content.ariaLabel}
      role="status"
    >
      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="2.5" y="7.5" width="11" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
        {status === "unlocked" ? (
          <path d="M5 7.5V5A3 3 0 0110.5 3.33" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        ) : (
          <path d="M5 7.5V5a3 3 0 016 0v2.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        )}
      </svg>
      <span>{content.label}</span>
    </div>
  );
}
