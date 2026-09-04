import { useEffect } from "react";

import { useAuth } from "@context/AuthContext";

// The actual splash — app.html's #boot-splash, animated by the standalone
// /src/bootSplash.ts script — exists entirely outside React (see the comment
// on #boot-splash in app.html for why: it starts playing before the ~1 MB
// main app bundle has even downloaded). This component is the one bridge
// between the two: it has no DOM of its own, it just tells bootSplash.ts
// once auth has resolved, by firing a window event bootSplash.ts is
// listening for. bootSplash.ts already knows on its own when the animation
// has finished playing — it fades out once *both* conditions are true.
export default function HeroSplashBridge() {
  const { loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    window.__authReady = true;
    window.dispatchEvent(new Event("clarity:auth-ready"));
  }, [loading]);

  return null;
}
