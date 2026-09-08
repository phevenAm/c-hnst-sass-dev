import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { access_token } = await req.json();
    if (!access_token) {
      return new Response(JSON.stringify({ error: "Missing access_token" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Identify the caller from their own session (signUp with auto-confirm on
    // returns a session, so functions.invoke attaches this automatically).
    // We confirm *this* account and no other — the previous version confirmed
    // whatever user_id the body carried, so anyone holding any unconsumed
    // token could force-confirm an arbitrary auth user (BOLA).
    const authHeader = req.headers.get("Authorization") ?? "";
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    // Token must still be valid (not yet consumed) — a second, independent gate.
    const { data: isValid } = await supabase.rpc("validate_platform_access_token", {
      input_token: String(access_token).trim(),
    });
    if (!isValid) {
      return new Response(JSON.stringify({ error: "Invalid or already-used access token" }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    const { error } = await supabase.auth.admin.updateUserById(user.id, { email_confirm: true });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
