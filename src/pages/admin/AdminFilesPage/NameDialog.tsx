import { useEffect, useRef, useState } from "react";

import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";

type Props = {
  title: string;
  label: string;
  initial?: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: (name: string) => void;
  onClose: () => void;
};

export default function NameDialog({
  title,
  label,
  initial = "",
  confirmLabel = "Save",
  busy,
  onConfirm,
  onClose,
}: Props) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = value.trim();
  const invalid = trimmed.length === 0 || trimmed.length > 255 || trimmed.includes("/");

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <Modal
      title={title}
      onClose={onClose}
      size="sm"
      actions={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => !invalid && onConfirm(trimmed)} disabled={busy || invalid}>
            {busy ? "Saving…" : confirmLabel}
          </Button>
        </>
      }
    >
      <label>
        <span style={{ display: "block", marginBottom: 6, fontSize: "0.9rem" }}>{label}</span>
        <input
          ref={inputRef}
          type="text"
          value={value}
          maxLength={255}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !invalid && !busy) onConfirm(trimmed);
          }}
          style={{ width: "100%", padding: "8px 10px", borderRadius: 8 }}
        />
      </label>
      {trimmed.includes("/") && (
        <p style={{ color: "var(--danger, #c0392b)", fontSize: "0.8rem", marginTop: 6 }}>
          Names can't contain a slash.
        </p>
      )}
    </Modal>
  );
}
