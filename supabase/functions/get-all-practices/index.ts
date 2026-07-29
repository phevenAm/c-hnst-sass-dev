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

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    // Verify caller is superadmin
    const { data: caller } = await supabase.from("users").select("is_superadmin").eq("id", user.id).single();

    if (!caller?.is_superadmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    // Fetch all practices with joined admin user info
    const { data: practices, error: fetchError } = await supabase
      .from("practice_settings")
      .select(`
        id,
        admin_id,
        business_name,
        subscription_status,
        subscription_plan,
        stripe_subscription_id,
        billing_customer_id,
        created_at,
        users!practice_settings_admin_id_fkey (
          first_name,
          last_name,
          email,
          created_at,
          disabled
        )
      `)
      .order("created_at", { ascending: false });

    if (fetchError) throw new Error(fetchError.message);

    return new Response(JSON.stringify({ practices }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders });
  }
});
