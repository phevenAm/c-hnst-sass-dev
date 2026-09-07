import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    // Anon key + the caller's JWT forwarded, so auth.uid() resolves to the
    // caller inside the SECURITY DEFINER RPC (which does the superadmin gate).
    // We deliberately DON'T use the service-role key here — the previous
    // implementation did, and its supabase.auth.admin.listUsers() call started
    // returning 500 "Database error finding users" on this project. The RPC
    // reads auth.users.email itself, in one round trip, and also stitches in
    // agencies.
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { data, error } = await supabase.rpc("superadmin_directory");
    if (error) {
      // The RPC raises 'Forbidden' (SQLSTATE 42501) for a non-superadmin.
      const status = error.code === "42501" || /forbidden/i.test(error.message) ? 403 : 500;
      return new Response(JSON.stringify({ error: error.message }), { status, headers: corsHeaders });
    }

    // data is { practices: [...], agencies: [...] } — pass it straight through.
    return new Response(JSON.stringify(data ?? { practices: [], agencies: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders });
  }
});
