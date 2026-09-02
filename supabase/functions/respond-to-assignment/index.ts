import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// The assigned admin accepts or declines an intake handed to them. The
// authorization + state transition live in respond_to_agency_assignment();
// this function just calls it as the user, then notifies the manager.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const {
      data: { user },
      error: authError,
    } = await asUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const body = await req.json().catch(() => ({}));
    const assignmentId = body?.assignment_id as string | undefined;
    const accept = body?.accept === true;
    const declineReason = typeof body?.decline_reason === "string" ? body.decline_reason : null;
    if (!assignmentId) {
      return new Response(JSON.stringify({ error: "assignment_id is required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const { error: rpcErr } = await asUser.rpc("respond_to_agency_assignment", {
      p_assignment_id: assignmentId,
      p_accept: accept,
      p_decline_reason: declineReason,
    });
    if (rpcErr) {
      return new Response(JSON.stringify({ error: rpcErr.message }), { status: 400, headers: corsHeaders });
    }

    // Notify the manager who made the assignment.
    const { data: assignment } = await admin
      .from("client_assignments")
      .select("from_manager_id, stub_id, client_stubs(first_name, last_name)")
      .eq("id", assignmentId)
      .single();

    if (assignment?.from_manager_id) {
      const stub = assignment.client_stubs as { first_name?: string; last_name?: string } | null;
      const name = `${stub?.first_name ?? ""} ${stub?.last_name ?? ""}`.trim() || "a client";
      await admin.from("notifications").insert({
        user_id: assignment.from_manager_id,
        type: "client_assignment_response",
        message: accept ? `${name} was accepted` : `${name} was declined`,
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    console.error("respond-to-assignment ERROR:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
