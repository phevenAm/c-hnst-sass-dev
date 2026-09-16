import { useEffect } from "react";

// Warns on a full page reload/tab close while a form has unsaved changes —
// the in-app "discard changes?" confirm (ConfirmModal) only catches closing
// the modal itself; this catches the browser-level exits it can't. Most
// browsers ignore the custom message and show their own generic text, but
// e.preventDefault() + setting returnValue is what actually triggers the
// native prompt at all.
export function useWarnOnDirtyUnload(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
}
