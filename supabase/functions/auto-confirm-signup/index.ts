import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user_id, access_token } = await req.json();
    if (!user_id || !access_token) {
      return new Response(JSON.stringify({ error: "Missing user_id or access_token" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Token must still be valid (not yet consumed) — this is the auth gate
    const { data: isValid } = await supabase.rpc("validate_platform_access_token", {
      input_token: access_token.trim(),
    });

    if (!isValid) {
      return new Response(JSON.stringify({ error: "Invalid or already-used access token" }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    const { error } = await supabase.auth.admin.updateUserById(user_id, {
      email_confirm: true,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
