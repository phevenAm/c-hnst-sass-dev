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

    // Fetch all practices. We deliberately DON'T use a PostgREST embed to
    // public.users here: (a) email lives on auth.users, not public.users, and
    // (b) the admin_id FK points at auth.users, so the embed can't resolve.
    // Instead we fetch owners separately and stitch in JS.
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
        created_at
      `)
      .order("created_at", { ascending: false });

    if (fetchError) throw new Error(fetchError.message);

    const list = practices ?? [];

    // No practices — return early (avoids an empty .in() query error).
    if (list.length === 0) {
      return new Response(JSON.stringify({ practices: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminIds = [...new Set(list.map((p) => p.admin_id).filter(Boolean))];

    // Owner name/status from public.users (email is NOT stored here).
    const { data: profiles, error: profErr } = await supabase
      .from("users")
      .select("id, first_name, last_name, created_at, disabled")
      .in("id", adminIds);
    if (profErr) throw new Error(profErr.message);
    const profileById = new Map((profiles ?? []).map((u) => [u.id, u]));

    // Owner email from auth.users (service-role admin API).
    // perPage is generous for now; paginate if the platform outgrows it.
    const { data: authList, error: authListErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (authListErr) throw new Error(authListErr.message);
    const emailById = new Map(authList.users.map((u) => [u.id, u.email ?? null]));

    const enriched = list.map((p) => {
      const prof = profileById.get(p.admin_id);
      return {
        ...p,
        users: {
          first_name: prof?.first_name ?? null,
          last_name: prof?.last_name ?? null,
          email: emailById.get(p.admin_id) ?? null,
          created_at: prof?.created_at ?? p.created_at,
          disabled: prof?.disabled ?? false,
        },
      };
    });

    return new Response(JSON.stringify({ practices: enriched }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders });
  }
});
