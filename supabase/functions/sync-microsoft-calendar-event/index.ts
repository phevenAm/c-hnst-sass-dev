import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const INTERNAL_SECRET = Deno.env.get("INTERNAL_MSCAL_SYNC_SECRET") ?? "";
const CLIENT_ID = Deno.env.get("MICROSOFT_CALENDAR_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("MICROSOFT_CALENDAR_CLIENT_SECRET") ?? "";
const TENANT = Deno.env.get("MICROSOFT_CALENDAR_TENANT") || "common";
const TOKEN_URL = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`;
const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPE = "offline_access Calendars.ReadWrite OnlineMeetings.ReadWrite User.Read";

interface SyncPayload {
  action: "upsert" | "delete";
  admin_id: string;
  session_id?: string;
  microsoft_event_id?: string | null;
}

async function refreshAccessToken(
  refreshToken: string,
): Promise<{ access_token: string; refresh_token: string | null; expires_at: string }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: SCOPE,
    }),
  });
  if (!res.ok) {
    throw new Error(`Microsoft token refresh failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  return {
    access_token: json.access_token,
    // Microsoft rotates the refresh token on most refreshes — persist the new one.
    refresh_token: json.refresh_token ?? null,
    expires_at: new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString(),
  };
}

// Graph wants a naive ISO string plus a separate timeZone field.
function graphTime(d: Date): { dateTime: string; timeZone: string } {
  return { dateTime: d.toISOString().replace("Z", ""), timeZone: "UTC" };
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
    const { action, admin_id, session_id, microsoft_event_id } = payload;

    const { data: conn } = await supabase
      .from("admin_microsoft_calendar")
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
        .from("admin_microsoft_calendar")
        .update({
          access_token: accessToken,
          access_token_expires_at: refreshed.expires_at,
          ...(refreshed.refresh_token ? { refresh_token: refreshed.refresh_token } : {}),
        })
        .eq("admin_id", admin_id);
    }

    const authHeaders = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

    if (action === "delete") {
      if (microsoft_event_id) {
        const res = await fetch(`${GRAPH}/me/events/${microsoft_event_id}`, { method: "DELETE", headers: authHeaders });
        // Already gone on Microsoft's side — treat as success.
        if (!res.ok && res.status !== 404 && res.status !== 410) {
          throw new Error(`Microsoft delete failed: ${res.status} ${await res.text()}`);
        }
      }
      if (session_id) {
        await supabase.from("sessions").update({ microsoft_event_id: null, teams_join_url: null }).eq("id", session_id);
      }
      return new Response(JSON.stringify({ ok: true }));
    }

    // action === "upsert"
    const { data: session } = await supabase
      .from("sessions")
      .select("id, client_id, scheduled_at, duration_minutes, location, address, microsoft_event_id, teams_join_url")
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

    const isOnline = session.location !== "in_person";
    const wantTeams = isOnline && conn.create_teams_links === true;

    const start = new Date(session.scheduled_at);
    const end = new Date(start.getTime() + (session.duration_minutes ?? 50) * 60_000);

    // One-way sync: edits made to this event in Outlook/Teams are never read
    // back into Clarity, so spell that out in the event body.
    const managedNote =
      "Managed by Clarity. Reschedule or cancel this session in the Clarity app — " +
      "changes made directly here are not synced back.";

    const eventBody: Record<string, unknown> = {
      subject: `${clientName} — Session`,
      body: {
        contentType: "HTML",
        content: [practice?.business_name ? `Practice: ${practice.business_name}` : "", managedNote]
          .filter(Boolean)
          .join("<br><br>"),
      },
      start: graphTime(start),
      end: graphTime(end),
      location: { displayName: isOnline ? "Online" : (session.address ?? "In person") },
      isOnlineMeeting: wantTeams,
      ...(wantTeams ? { onlineMeetingProvider: "teamsForBusiness" } : {}),
    };

    const existingId = session.microsoft_event_id ?? microsoft_event_id;
    let graphRes: Response;
    if (existingId) {
      graphRes = await fetch(`${GRAPH}/me/events/${existingId}`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify(eventBody),
      });
      if (graphRes.status === 404) {
        // Deleted on Microsoft's side — recreate.
        graphRes = await fetch(`${GRAPH}/me/events`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify(eventBody),
        });
      }
    } else {
      graphRes = await fetch(`${GRAPH}/me/events`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(eventBody),
      });
    }

    if (!graphRes.ok) {
      throw new Error(`Microsoft event upsert failed: ${graphRes.status} ${await graphRes.text()}`);
    }

    const graphEvent = await graphRes.json();
    const newEventId: string | null = graphEvent.id ?? existingId ?? null;
    const joinUrl: string | null = wantTeams
      ? (graphEvent.onlineMeeting?.joinUrl ?? session.teams_join_url ?? null)
      : null;

    // Work out the write-back, and only issue the UPDATE if something actually
    // changed. Writing only microsoft_event_id / teams_join_url can't re-fire
    // the sessions trigger (not in its column list). Writing `address` can —
    // but on that second pass `existingId` is set so we PATCH, get back the
    // same joinUrl, and `address` is now non-empty, so `patch` comes out empty
    // and it stops after one redundant PATCH.
    const patch: Record<string, unknown> = {};
    if (newEventId && newEventId !== session.microsoft_event_id) patch.microsoft_event_id = newEventId;
    if (joinUrl !== session.teams_join_url) patch.teams_join_url = joinUrl;
    // Surface the join link through the field every existing "Join meeting"
    // link already reads — but never clobber an address the practitioner set.
    if (wantTeams && joinUrl && !session.address) {
      patch.address = joinUrl;
    } else if (!wantTeams && session.address && session.address === session.teams_join_url) {
      // Session flipped to in-person (or Teams links turned off) and the only
      // thing in address was our old auto-set join URL — clear it.
      patch.address = null;
    }

    if (Object.keys(patch).length > 0) {
      await supabase.from("sessions").update(patch).eq("id", session.id);
    }

    return new Response(JSON.stringify({ ok: true }));
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
