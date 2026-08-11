import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const VALID_TYPES = [
  "session_reminder",
  "session_booked",
  "session_cancelled",
  "session_rescheduled",
  "payment_reminder",
  "questionnaire_assigned",
] as const;

type EmailType = (typeof VALID_TYPES)[number];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const type = url.searchParams.get("type") as EmailType | null;

    if (!token || !type) {
      return new Response(JSON.stringify({ error: "Missing token or type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!VALID_TYPES.includes(type)) {
      return new Response(JSON.stringify({ error: "Invalid email type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: user, error } = await supabase
      .from("users")
      .select("id, email_prefs_disabled")
      .eq("unsubscribe_token", token)
      .single();

    if (error || !user) {
      return new Response(JSON.stringify({ error: "Invalid unsubscribe link" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const current: string[] = user.email_prefs_disabled ?? [];

    if (current.includes(type)) {
      return new Response(JSON.stringify({ ok: true, already: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: updateError } = await supabase
      .from("users")
      .update({ email_prefs_disabled: [...current, type] })
      .eq("id", user.id);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
