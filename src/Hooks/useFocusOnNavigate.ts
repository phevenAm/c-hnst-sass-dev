import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

// Focuses an invisible anchor element on each route change, moving keyboard
// focus to the top of the new page for screen-reader users. Also resets
// #main-content's scroll position — it's a persistent element (AppLayout
// only swaps the <Outlet/> inside it, never remounts), so without this the
// new page opens wherever the old one was scrolled to. On iOS PWAs this also
// works around a WebKit compositing bug where swapping DOM inside a
// scrollable container without a forced reflow can leave the previous page
// visibly painted underneath the new one until something scrolls it.
export function useFocusOnNavigate() {
  const location = useLocation();
  const ref = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: location triggers focus; its value is intentionally unused inside the callback
  useEffect(() => {
    document.getElementById("main-content")?.scrollTo(0, 0);
    ref.current?.focus({ preventScroll: true });
  }, [location]);

  return ref;
}
