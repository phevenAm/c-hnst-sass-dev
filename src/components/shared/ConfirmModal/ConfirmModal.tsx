import type { ReactNode } from "react";

import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";

type NotifyOption = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

type ConfirmModalProps = {
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  confirming?: boolean;
  notifyOption?: NotifyOption;
  onConfirm: () => void;
  onClose: () => void;
};

// Shared "are you sure?" dialog for destructive/disputed actions. State (the
// notify checkbox, a `confirming` submit flag) stays with the caller — this
// component is just presentation, same as CancelSessionModal/DeleteSessionModal
// already do it, so those two can be migrated onto this later without a
// behaviour change.
export default function ConfirmModal({
  title,
  children,
  confirmLabel = "Yes, confirm",
  cancelLabel = "Cancel",
  danger = true,
  confirming = false,
  notifyOption,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      size="sm"
      actions={
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={confirming}>
            {confirming ? "Working…" : confirmLabel}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={confirming}>
            {cancelLabel}
          </Button>
        </div>
      }
    >
      {children}
      {notifyOption && (
        <label
          style={{
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
            marginTop: "1rem",
            fontSize: "0.85rem",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={notifyOption.checked}
            onChange={(e) => notifyOption.onChange(e.target.checked)}
          />
          {notifyOption.label}
        </label>
      )}
    </Modal>
  );
}
