import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

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

    // Caller must be an active manager of an agency.
    const { data: membership } = await supabase
      .from("agency_members")
      .select("agency_id, role, status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (membership?.role !== "manager" || membership?.status !== "active") {
      return new Response(JSON.stringify({ error: "Not an agency manager" }), { status: 403, headers: corsHeaders });
    }

    const { data: channel } = await supabase
      .from("agency_teams_channel")
      .select("webhook_url")
      .eq("agency_id", membership.agency_id)
      .maybeSingle();

    if (!channel?.webhook_url) {
      return new Response(JSON.stringify({ error: "No Teams webhook saved yet" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const res = await fetch(channel.webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "message",
        attachments: [
          {
            contentType: "application/vnd.microsoft.card.adaptive",
            content: {
              $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
              type: "AdaptiveCard",
              version: "1.4",
              body: [
                { type: "TextBlock", text: "Clarity test message", weight: "Bolder", size: "Medium", color: "Good" },
                {
                  type: "TextBlock",
                  wrap: true,
                  text: "If you can see this in your channel, session-booked / cancelled / paid notifications will post here.",
                },
              ],
            },
          },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return new Response(
        JSON.stringify({ error: `Teams rejected the message (${res.status}). Check the webhook URL.`, detail }),
        { status: 502, headers: corsHeaders },
      );
    }

    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
