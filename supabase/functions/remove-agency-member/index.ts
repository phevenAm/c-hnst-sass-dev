import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Manager removes a member from the agency. Their client-facing caseload
// (clients, offline records, sessions, payments) is reassigned to `reassign_to`
// — another active member, or the acting manager if omitted.
//
// NOT moved: questionnaire/resource templates (authored content stays with the
// author) and session_notes. Encrypted note bodies are sealed to the original
// admin's key, so ownership is left untouched rather than handing over rows the
// new admin can't read.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { data: me } = await supabase
      .from("agency_members")
      .select("agency_id, role, status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!me || me.role !== "manager" || me.status !== "active") {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    const body = await req.json().catch(() => ({}));
    const memberUserId = body?.member_user_id as string | undefined;
    let reassignTo = (body?.reassign_to as string | undefined) ?? user.id;
    if (!memberUserId) {
      return new Response(JSON.stringify({ error: "member_user_id is required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }
    if (memberUserId === reassignTo) {
      return new Response(JSON.stringify({ error: "Can't reassign a member's clients to themselves" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const { data: agency } = await supabase.from("agencies").select("owner_id").eq("id", me.agency_id).single();
    if (agency?.owner_id === memberUserId) {
      return new Response(JSON.stringify({ error: "The agency owner can't be removed" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const { data: member } = await supabase
      .from("agency_members")
      .select("id, agency_id")
      .eq("user_id", memberUserId)
      .maybeSingle();
    if (!member || member.agency_id !== me.agency_id) {
      return new Response(JSON.stringify({ error: "Not a member of your agency" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    const { data: dest } = await supabase
      .from("agency_members")
      .select("user_id, status, agency_id")
      .eq("user_id", reassignTo)
      .maybeSingle();
    if (!dest || dest.agency_id !== me.agency_id || dest.status !== "active") {
      return new Response(JSON.stringify({ error: "reassign_to must be an active member of your agency" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Reassign caseload.
    await supabase.from("users").update({ admin_id: reassignTo }).eq("admin_id", memberUserId).eq("role", "client");
    await supabase.from("client_stubs").update({ created_by: reassignTo }).eq("created_by", memberUserId);
    await supabase.from("sessions").update({ created_by: reassignTo }).eq("created_by", memberUserId);
    await supabase.from("stub_sessions").update({ admin_id: reassignTo }).eq("admin_id", memberUserId);
    await supabase.from("payments").update({ admin_id: reassignTo }).eq("admin_id", memberUserId);
    // Any pending intake handed to the leaver goes to the destination admin.
    await supabase
      .from("client_assignments")
      .update({ to_admin_id: reassignTo })
      .eq("to_admin_id", memberUserId)
      .eq("status", "pending");

    // Detach from the agency.
    await supabase.from("agency_members").delete().eq("id", member.id);
    await supabase.from("users").update({ agency_id: null }).eq("id", memberUserId);

    await supabase.from("notifications").insert({
      user_id: reassignTo,
      type: "agency_caseload_transfer",
      message: "A departing colleague's clients have been reassigned to you",
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    console.error("remove-agency-member ERROR:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
