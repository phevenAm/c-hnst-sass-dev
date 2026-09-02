import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const TENANT = Deno.env.get("MICROSOFT_CALENDAR_TENANT") || "common";
const TOKEN_URL = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
    if (profile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    const { code, redirect_uri } = await req.json();
    if (!code || !redirect_uri) {
      return new Response(JSON.stringify({ error: "Missing code or redirect_uri" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: Deno.env.get("MICROSOFT_CALENDAR_CLIENT_ID")!,
        client_secret: Deno.env.get("MICROSOFT_CALENDAR_CLIENT_SECRET")!,
        redirect_uri,
        grant_type: "authorization_code",
        // Must match the scopes requested in the browser authorize step.
        scope: "offline_access Calendars.ReadWrite OnlineMeetings.ReadWrite User.Read",
      }),
    });

    if (!tokenRes.ok) {
      const detail = await tokenRes.text();
      return new Response(JSON.stringify({ error: `Microsoft token exchange failed: ${detail}` }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const tokenJson = await tokenRes.json();
    if (!tokenJson.refresh_token) {
      // offline_access wasn't granted, or this is a silent re-auth without consent.
      return new Response(
        JSON.stringify({ error: "No refresh token returned — disconnect and reconnect to grant fresh access." }),
        { status: 400, headers: corsHeaders },
      );
    }

    // Fetch the connected account's email for display in Settings.
    const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const me = meRes.ok ? await meRes.json() : {};
    const email = me.mail ?? me.userPrincipalName ?? null;

    const expiresAt = new Date(Date.now() + (tokenJson.expires_in ?? 3600) * 1000).toISOString();

    await supabase.from("admin_microsoft_calendar").upsert({
      admin_id: user.id,
      microsoft_email: email,
      refresh_token: tokenJson.refresh_token,
      access_token: tokenJson.access_token,
      access_token_expires_at: expiresAt,
      sync_enabled: true,
      updated_at: new Date().toISOString(),
    });

    return new Response(JSON.stringify({ success: true, microsoft_email: email }), { headers: corsHeaders });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
