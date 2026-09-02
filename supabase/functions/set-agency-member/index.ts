import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Manager edits a member: role (manager|counsellor), counselling_enabled,
// status (active|disabled). Disabling also flips users.disabled so the shared
// pause machinery blocks their sign-in. The agency owner can't be demoted or
// disabled, and an agency can't be left with zero active managers.
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
    if (!memberUserId) {
      return new Response(JSON.stringify({ error: "member_user_id is required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const { data: agency } = await supabase.from("agencies").select("owner_id").eq("id", me.agency_id).single();
    const { data: member } = await supabase
      .from("agency_members")
      .select("id, agency_id, role, status, counselling_enabled")
      .eq("user_id", memberUserId)
      .maybeSingle();
    if (!member || member.agency_id !== me.agency_id) {
      return new Response(JSON.stringify({ error: "Not a member of your agency" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    const isOwner = agency?.owner_id === memberUserId;
    const patch: Record<string, unknown> = {};

    if (body?.role === "manager" || body?.role === "counsellor") {
      if (isOwner && body.role !== "manager") {
        return new Response(JSON.stringify({ error: "The agency owner must stay a manager" }), {
          status: 400,
          headers: corsHeaders,
        });
      }
      patch.role = body.role;
    }
    if (typeof body?.counselling_enabled === "boolean") patch.counselling_enabled = body.counselling_enabled;
    if (body?.status === "active" || body?.status === "disabled") {
      if (isOwner && body.status === "disabled") {
        return new Response(JSON.stringify({ error: "The agency owner can't be disabled" }), {
          status: 400,
          headers: corsHeaders,
        });
      }
      patch.status = body.status;
    }

    if (Object.keys(patch).length === 0) {
      return new Response(JSON.stringify({ error: "Nothing to update" }), { status: 400, headers: corsHeaders });
    }

    // Guard: don't strip the agency's last active manager.
    const losingManager =
      (patch.role === "counsellor" || patch.status === "disabled") &&
      member.role === "manager" &&
      member.status === "active";
    if (losingManager) {
      const { count } = await supabase
        .from("agency_members")
        .select("id", { count: "exact", head: true })
        .eq("agency_id", me.agency_id)
        .eq("role", "manager")
        .eq("status", "active");
      if ((count ?? 0) <= 1) {
        return new Response(JSON.stringify({ error: "An agency needs at least one active manager" }), {
          status: 400,
          headers: corsHeaders,
        });
      }
    }

    const { error: updErr } = await supabase.from("agency_members").update(patch).eq("id", member.id);
    if (updErr) throw new Error(updErr.message);

    if (patch.status === "disabled") {
      await supabase.from("users").update({ disabled: true }).eq("id", memberUserId);
    } else if (patch.status === "active") {
      await supabase.from("users").update({ disabled: false }).eq("id", memberUserId);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    console.error("set-agency-member ERROR:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
