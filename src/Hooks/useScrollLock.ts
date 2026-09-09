import { useEffect } from "react";

// Ref-counted scroll lock for overlays (Modal, full-screen PdfViewer, stacked
// modals).
//
// Several things can want the page frozen at once — a Modal, a PdfViewer opened
// full-screen from inside that Modal, two stacked modals. The naive approach
// (snapshot on mount, restore on unmount) breaks when those overlap: whichever
// unmounts last writes back a stale "hidden" it captured while another lock was
// active, and the whole app is left unable to scroll ("scroll randomly
// disappears"). Here the real values are captured once, when the first lock is
// taken, and restored once, when the last lock is released.
//
// The scroll container is #main-content inside the authed shell and #root on the
// standalone pages (login, /help, …) — never <body>, which no longer scrolls.
// We freeze all of them plus <body> so a lock holds wherever the overlay opens.

let lockCount = 0;
const saved: Array<[HTMLElement, string]> = [];

function lockTargets(): HTMLElement[] {
  const els: HTMLElement[] = [document.body];
  for (const id of ["main-content", "root"]) {
    const el = document.getElementById(id);
    if (el) els.push(el);
  }
  return els;
}

export function useScrollLock(active = true): void {
  useEffect(() => {
    if (!active) return;

    if (lockCount === 0) {
      for (const el of lockTargets()) {
        saved.push([el, el.style.overflow]);
        el.style.overflow = "hidden";
      }
    }
    lockCount += 1;

    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        for (const [el, value] of saved) el.style.overflow = value;
        saved.length = 0;
      }
    };
  }, [active]);
}
