import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { supabase } from "@/lib/supabase";

export default function MicrosoftCalendarCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  // biome-ignore lint/correctness/useExhaustiveDependencies: must run exactly once — searchParams.get is a new reference every render (useSearchParams doesn't memoize), and the OAuth code is single-use, so re-running this on every render would resubmit an already-consumed code
  useEffect(() => {
    const code = searchParams.get("code");
    const oauthError = searchParams.get("error");

    if (oauthError) {
      setError(oauthError === "access_denied" ? "Microsoft calendar connection was cancelled." : oauthError);
      return;
    }

    if (!code) {
      setError("No authorisation code received from Microsoft.");
      return;
    }

    supabase.functions
      .invoke("microsoft-calendar-oauth", {
        body: { code, redirect_uri: `${window.location.origin}/settings/microsoft-callback` },
      })
      .then(({ error: fnError }) => {
        if (fnError) {
          setError(fnError.message || "Failed to connect Microsoft calendar.");
        } else {
          navigate("/settings?microsoft=connected", { replace: true });
        }
      });
  }, []);

  if (error) {
    return (
      <div className="page">
        <div className="inner">
          <h1>Microsoft calendar connection failed</h1>
          <p>{error}</p>
          <Link to="/settings">Back to settings</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="inner">
        <p>Connecting your Microsoft calendar…</p>
      </div>
    </div>
  );
}
