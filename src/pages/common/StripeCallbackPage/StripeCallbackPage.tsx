import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "@context/AuthContext";

import { supabase } from "@/lib/supabase";

export default function StripeCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshPracticeSettings } = useAuth();
  const [error, setError] = useState("");

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) {
      setError("No authorisation code received from Stripe.");
      return;
    }

    supabase.functions.invoke("stripe-connect-oauth", { body: { code } }).then(async ({ error: fnError }) => {
      if (fnError) {
        setError(fnError.message || "Failed to connect Stripe account.");
      } else {
        await refreshPracticeSettings();
        navigate("/settings?stripe=connected", { replace: true });
      }
    });
  }, []);

  if (error) {
    return (
      <div className="page">
        <div className="inner">
          <h1>Stripe connection failed</h1>
          <p>{error}</p>
          <Link to="/settings">Back to settings</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="inner">
        <p>Connecting your Stripe account…</p>
      </div>
    </div>
  );
}
