import React, { useEffect, useRef } from "react";

import CloseIcon from "@mui/icons-material/Close";

import Button from "@components/shared/Button/Button";

import styles from "./Modal.module.scss";

export type ModalProps = {
  title: string;
  onClose: () => void;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  size?: "sm" | "md" | "lg";
};

export default function Modal({ title, onClose, children, actions, size = "md" }: ModalProps) {
  const mouseDownTarget = useRef<EventTarget | null>(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEsc);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss — keyboard handled via Escape in useEffect
    <div
      className={styles.modalOverlay}
      onMouseDown={(e) => {
        mouseDownTarget.current = e.target;
      }}
      onClick={(e) => {
        if (mouseDownTarget.current === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        className={`${styles.modalContainer} ${styles[size]}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <h2 id="modal-title">{title}</h2>
          <Button
            type="button"
            variant="secondary"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close modal"
          >
            <CloseIcon />
          </Button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.children}>{children}</div>
          {actions && <div className={styles.modalActions}>{actions}</div>}
        </div>
      </div>
    </div>
  );
}
