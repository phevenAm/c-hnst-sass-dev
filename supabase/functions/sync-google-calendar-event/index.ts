import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const INTERNAL_SECRET = Deno.env.get("INTERNAL_GOOGLE_SYNC_SECRET") ?? "";
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID") ?? "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET") ?? "";

interface SyncPayload {
  action: "upsert" | "delete";
  admin_id: string;
  session_id?: string;
  google_event_id?: string | null;
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_at: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token refresh failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  const expiresAt = new Date(Date.now() + json.expires_in * 1000).toISOString();
  return { access_token: json.access_token, expires_at: expiresAt };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200 });

  const providedSecret = req.headers.get("x-internal-secret") ?? "";
  if (!INTERNAL_SECRET || providedSecret !== INTERNAL_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const payload: SyncPayload = await req.json();
    const { action, admin_id, session_id, google_event_id } = payload;

    const { data: conn } = await supabase
      .from("admin_google_calendar")
      .select("*")
      .eq("admin_id", admin_id)
      .maybeSingle();

    if (!conn || !conn.sync_enabled) {
      return new Response(JSON.stringify({ ok: true, skipped: true }));
    }

    // Refresh the access token if it's missing or about to expire.
    let accessToken = conn.access_token as string | null;
    const expiresAt = conn.access_token_expires_at ? new Date(conn.access_token_expires_at).getTime() : 0;
    if (!accessToken || expiresAt < Date.now() + 60_000) {
      const refreshed = await refreshAccessToken(conn.refresh_token);
      accessToken = refreshed.access_token;
      await supabase
        .from("admin_google_calendar")
        .update({ access_token: accessToken, access_token_expires_at: refreshed.expires_at })
        .eq("admin_id", admin_id);
    }

    const calendarId = encodeURIComponent(conn.calendar_id ?? "primary");
    const authHeaders = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

    if (action === "delete") {
      if (google_event_id) {
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${google_event_id}`,
          { method: "DELETE", headers: authHeaders },
        );
        // 404/410/410 Gone: event was already removed on Google's side — treat as success.
        if (!res.ok && res.status !== 404 && res.status !== 410) {
          throw new Error(`Google delete failed: ${res.status} ${await res.text()}`);
        }
      }
      if (session_id) {
        await supabase.from("sessions").update({ google_event_id: null }).eq("id", session_id);
      }
      return new Response(JSON.stringify({ ok: true }));
    }

    // action === "upsert"
    const { data: session } = await supabase
      .from("sessions")
      .select("id, client_id, scheduled_at, duration_minutes, location, address, google_event_id")
      .eq("id", session_id)
      .single();

    if (!session) {
      return new Response(JSON.stringify({ error: "Session not found" }), { status: 404 });
    }

    const [{ data: client }, { data: practice }] = await Promise.all([
      supabase.from("users").select("display_name, first_name, last_name").eq("id", session.client_id).maybeSingle(),
      supabase.from("practice_settings").select("business_name").eq("admin_id", admin_id).maybeSingle(),
    ]);

    const clientName =
      client?.display_name || [client?.first_name, client?.last_name].filter(Boolean).join(" ") || "Client";

    const start = new Date(session.scheduled_at);
    const end = new Date(start.getTime() + (session.duration_minutes ?? 50) * 60_000);

    // One-way sync: edits made to this event in Google Calendar are never read
    // back into Clarity, so spell that out in the event body.
    const managedNote =
      "Managed by Clarity. Reschedule or cancel this session in the Clarity app — " +
      "changes made directly here in Google Calendar are not synced back.";

    const eventBody = {
      summary: `${clientName} — Session`,
      description: [practice?.business_name ? `Practice: ${practice.business_name}` : null, managedNote]
        .filter(Boolean)
        .join("\n\n"),
      location: session.location === "in_person" ? (session.address ?? undefined) : "Online",
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    };

    const existingId = session.google_event_id ?? google_event_id;
    let googleRes: Response;
    if (existingId) {
      googleRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${existingId}`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify(eventBody),
      });
      if (googleRes.status === 404) {
        // Event was deleted on Google's side — fall back to creating a new one.
        googleRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify(eventBody),
        });
      }
    } else {
      googleRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(eventBody),
      });
    }

    if (!googleRes.ok) {
      throw new Error(`Google event upsert failed: ${googleRes.status} ${await googleRes.text()}`);
    }

    const googleEvent = await googleRes.json();
    if (googleEvent.id && googleEvent.id !== session.google_event_id) {
      await supabase.from("sessions").update({ google_event_id: googleEvent.id }).eq("id", session_id);
    }

    return new Response(JSON.stringify({ ok: true }));
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
