// ============================================================
// Agency → Microsoft Teams channel notifications (one-way).
//
// If the practitioner belongs to an agency and that agency has wired up an
// Incoming Webhook / Workflows URL (public.agency_teams_channel), post a card
// for session-booked / cancelled / paid events. Best-effort: any failure is
// logged and swallowed so it can never break the booking or payment flow.
//
// The webhook URL is a Teams "Post to a channel when a webhook request is
// received" Workflows trigger (or a legacy Office 365 Incoming Webhook). Both
// accept this Adaptive-Card-in-an-attachment payload.
// ============================================================

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export type AgencyTeamsEvent = "booked" | "cancelled" | "paid";

const EVENT_META: Record<AgencyTeamsEvent, { flag: string; verb: string; accent: string }> = {
  booked: { flag: "notify_booked", verb: "Session booked", accent: "good" },
  cancelled: { flag: "notify_cancelled", verb: "Session cancelled", accent: "attention" },
  paid: { flag: "notify_paid", verb: "Payment received", accent: "good" },
};

export interface AgencyTeamsCardInput {
  event: AgencyTeamsEvent;
  /** The client's display name (first name is fine). */
  clientName: string;
  /** One-line detail, e.g. "3 Sep at 2:30pm" or "£60.00 — 3 Sep session". */
  detail: string;
}

export async function postAgencyTeamsCard(
  supabase: SupabaseClient,
  practitionerUserId: string | null | undefined,
  input: AgencyTeamsCardInput,
): Promise<{ posted: boolean; reason?: string }> {
  try {
    if (!practitionerUserId) return { posted: false, reason: "no practitioner" };

    const { data: membership } = await supabase
      .from("agency_members")
      .select("agency_id")
      .eq("user_id", practitionerUserId)
      .eq("status", "active")
      .maybeSingle();

    if (!membership?.agency_id) return { posted: false, reason: "not in an agency" };

    const { data: channel } = await supabase
      .from("agency_teams_channel")
      .select("webhook_url, notify_booked, notify_cancelled, notify_paid")
      .eq("agency_id", membership.agency_id)
      .maybeSingle();

    const meta = EVENT_META[input.event];
    if (!channel?.webhook_url || channel[meta.flag] !== true) {
      return { posted: false, reason: "not configured for this event" };
    }

    const { data: practitioner } = await supabase
      .from("users")
      .select("display_name, first_name, last_name")
      .eq("id", practitionerUserId)
      .maybeSingle();

    const practitionerName =
      practitioner?.display_name ||
      [practitioner?.first_name, practitioner?.last_name].filter(Boolean).join(" ") ||
      "A practitioner";

    const res = await fetch(channel.webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildCard(meta.verb, meta.accent, practitionerName, input)),
    });

    if (!res.ok) {
      console.error(`agencyTeams: webhook ${res.status} ${await res.text().catch(() => "")}`);
      return { posted: false, reason: `webhook ${res.status}` };
    }
    return { posted: true };
  } catch (err) {
    console.error("agencyTeams: post failed", err);
    return { posted: false, reason: "error" };
  }
}

function buildCard(
  title: string,
  accent: string,
  practitionerName: string,
  input: AgencyTeamsCardInput,
): Record<string, unknown> {
  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            {
              type: "TextBlock",
              text: title,
              weight: "Bolder",
              size: "Medium",
              color: accent === "attention" ? "Attention" : "Good",
            },
            {
              type: "FactSet",
              facts: [
                { title: "Practitioner", value: practitionerName },
                { title: "Client", value: input.clientName },
                { title: "Details", value: input.detail },
              ],
            },
          ],
        },
      },
    ],
  };
}
