import { createContext, useCallback, useContext, useRef, useState } from "react";

import styles from "./ToastContext.module.scss";

type ToastColourType = "warning" | "success" | "danger" | "neutral";
type ToastAction = { label: string; onClick: () => void };
type ToastContextType = { showToast: (msg: string, type?: ToastColourType, action?: ToastAction) => void };

const ToastContext = createContext<ToastContextType>({ showToast: () => {} });

export const useToast = () => useContext(ToastContext);

// Toasts carrying an action button stay up longer than a plain status
// message — 3.5s is enough time to read "Saved.", not enough to notice,
// decide, and tap a button before it vanishes.
const PLAIN_DURATION_MS = 3500;
const ACTION_DURATION_MS = 12000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<ToastColourType | null>("neutral");
  const [action, setAction] = useState<ToastAction | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    setMessage(null);
    setToastType("neutral");
    setAction(null);
  }, []);

  const showToast = useCallback(
    (msg: string, type: ToastColourType = "neutral", toastAction?: ToastAction) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setMessage(msg);
      setToastType(type);
      setAction(toastAction ?? null);
      timerRef.current = setTimeout(dismiss, toastAction ? ACTION_DURATION_MS : PLAIN_DURATION_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {message && (
        <div
          className={[styles.toast, styles[toastType ?? "neutral"], action ? styles.hasAction : ""].join(" ")}
          role="status"
          aria-live="polite"
        >
          <span>{message}</span>
          {action && (
            <button
              type="button"
              className={styles.toastAction}
              onClick={() => {
                action.onClick();
                dismiss();
              }}
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}
