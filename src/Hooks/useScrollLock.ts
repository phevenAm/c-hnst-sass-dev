import { useEffect } from "react";

// Ref-counted body scroll lock.
//
// Several things can want the page frozen at once — a Modal, a PdfViewer opened
// full-screen from inside that Modal, two stacked modals. The old approach
// (snapshot document.body.style.overflow on mount, restore it on unmount) breaks
// when those overlap: whichever unmounts last writes back a stale "hidden" it
// captured while another lock was active, and the whole app is left unable to
// scroll ("scroll randomly disappears").
//
// Here the real value is captured once, when the first lock is taken, and
// restored once, when the last lock is released.

let lockCount = 0;
let restoreOverflow = "";

export function useScrollLock(active = true): void {
  useEffect(() => {
    if (!active) return;

    if (lockCount === 0) {
      restoreOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    lockCount += 1;

    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        document.body.style.overflow = restoreOverflow;
      }
    };
  }, [active]);
}
