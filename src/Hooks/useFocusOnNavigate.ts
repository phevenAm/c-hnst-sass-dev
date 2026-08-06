import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

// Focuses an invisible anchor element on each route change, moving keyboard
// focus to the top of the new page for screen-reader users.
export function useFocusOnNavigate() {
  const location = useLocation();
  const ref = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: location triggers focus; its value is intentionally unused inside the callback
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, [location]);

  return ref;
}
