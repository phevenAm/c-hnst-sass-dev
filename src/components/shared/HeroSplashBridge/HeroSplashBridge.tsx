import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { useAuth } from "@context/AuthContext";
import { useAppSelector } from "@store/hooks";
import type { RootState } from "@store/index";

// The actual splash — app.html's #boot-splash, animated by the standalone
// /src/bootSplash.ts script — exists entirely outside React (see the comment
// on #boot-splash in app.html for why: it starts playing before the ~1 MB
// main app bundle has even downloaded). This component is the one bridge
// between the two: it has no DOM of its own, it just tells bootSplash.ts
// once auth has resolved, by firing a window event bootSplash.ts is
// listening for. bootSplash.ts already knows on its own when the animation
// has finished playing — it fades out once *both* conditions are true.
//
// On the admin dashboard specifically, "auth resolved" used to mean the
// splash faded straight into AdminDashboard's OWN isPageStatusLoading()
// spinner while userDirectory/sessions were still loading — a cold load
// went splash → fade → plain spinner → content, two loading moments back to
// back instead of one. Landing on /admin now also waits on those two
// fetches before signalling ready, so the branded splash covers the whole
// wait and the dashboard mounts with data already there. Every other route
// is unaffected — this check only applies on /admin itself.
export default function HeroSplashBridge() {
  const { loading } = useAuth();
  const { pathname } = useLocation();
  const usersStatus = useAppSelector((s: RootState) => s.userDirectory.status);
  const sessionsStatus = useAppSelector((s: RootState) => s.sessions.status);

  const onDashboard = pathname === "/admin";
  const dashboardPending =
    onDashboard &&
    (usersStatus === "idle" || usersStatus === "loading" || sessionsStatus === "idle" || sessionsStatus === "loading");

  useEffect(() => {
    if (loading || dashboardPending) return;
    window.__authReady = true;
    window.dispatchEvent(new Event("clarity:auth-ready"));
  }, [loading, dashboardPending]);

  return null;
}
