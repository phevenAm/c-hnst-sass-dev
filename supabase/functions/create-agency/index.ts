import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Turns the calling admin into the OWNER + first MANAGER of a brand-new agency.
// Billing is not touched here — that's a later phase. Guardrails:
//   * caller must be an admin
//   * caller must not already belong to an agency (one agency per user)
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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

    const { data: existing } = await supabase.from("agency_members").select("id").eq("user_id", user.id).maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ error: "You already belong to an agency" }), {
        status: 409,
        headers: corsHeaders,
      });
    }

    const body = await req.json().catch(() => ({}));
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
      return new Response(JSON.stringify({ error: "Agency name is required" }), { status: 400, headers: corsHeaders });
    }

    const { data: agency, error: agencyErr } = await supabase
      .from("agencies")
      .insert({ name, owner_id: user.id })
      .select("id, name")
      .single();
    if (agencyErr) throw new Error(agencyErr.message);

    const { error: memberErr } = await supabase.from("agency_members").insert({
      agency_id: agency.id,
      user_id: user.id,
      role: "manager",
      employment_type: "employee",
      counselling_enabled: typeof body?.counselling_enabled === "boolean" ? body.counselling_enabled : true,
      joined_at: new Date().toISOString(),
    });
    if (memberErr) {
      // roll back the agency so a retry is clean
      await supabase.from("agencies").delete().eq("id", agency.id);
      throw new Error(memberErr.message);
    }

    await supabase.from("users").update({ agency_id: agency.id }).eq("id", user.id);

    return new Response(JSON.stringify({ agency }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    console.error("create-agency ERROR:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
