import type { ConversationWithPeer, Message } from "../../models/globalTypes";

// The demo practice's two fixed accounts (see the demo seed migrations —
// 20260826000019_recreate_demo_checkin.sql names them).
export const DEMO_ADMIN_ID = "63aeb602-0056-4217-b120-9b6dc0c7c649"; // Amanda — the counsellor
export const DEMO_CLIENT_ID = "3d5e1d85-d7c6-4573-b61e-91d19daa07bb"; // Cassie — the client

// A stable, non-UUID id so `/messages/:conversationId` deep links resolve in
// the demo. Deliberately not a UUID: realtime keys off UUIDs and never has to
// match this.
export const DEMO_CONVERSATION_ID = "demo-conversation-cassie-amanda";

const DAY_MS = 86_400_000;

// One scripted exchange between Cassie and Amanda over the last few days.
// Timestamps are relative to "now" so the demo always reads as current; keep
// the lines in ascending chronological order.
type ScriptLine = { from: "admin" | "client"; agoDays: number; at: string; body: string };

const SCRIPT: ScriptLine[] = [
  {
    from: "admin",
    agoDays: 4,
    at: "09:12",
    body:
      "Morning Cassie — your invoice for this month has just come through on my side and I can see the payment has cleared. " +
      "I'll mark it as paid on your account now, so there's nothing further you need to do. Thanks for settling it so quickly.",
  },
  {
    from: "client",
    agoDays: 4,
    at: "12:47",
    body: "Thank you, Amanda! Good to know that went through smoothly. See you Monday.",
  },
  {
    from: "client",
    agoDays: 2,
    at: "18:26",
    body:
      "Hi Amanda, I'm really sorry for the short notice — a family emergency has come up and I don't think I can make our session this week. " +
      "Would it be alright to cancel it for now? I'll rebook as soon as things have settled down.",
  },
  {
    from: "admin",
    agoDays: 2,
    at: "19:05",
    body:
      "Of course, Cassie — I'm sorry to hear that and I hope everyone's okay. I've cancelled this week's session and there's no charge for it. " +
      "Take whatever time you need, and message me here whenever you're ready to pick things back up.",
  },
  {
    from: "client",
    agoDays: 1,
    at: "08:40",
    body: "That really means a lot, thank you for being so understanding. I'll be in touch soon.",
  },
];

function isoAt(agoDays: number, hhmm: string): string {
  const d = new Date(Date.now() - agoDays * DAY_MS);
  const [h, m] = hhmm.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

/**
 * Build the demo messaging state for whoever is signed in — the demo admin
 * (Amanda) or the demo client (Cassie). Pure and client-side only: while
 * `isDemo` is true this replaces the real conversation list and thread
 * entirely, and nothing here is ever written back to Supabase.
 */
export function buildDemoMessaging(selfId: string): {
  conversation: ConversationWithPeer;
  messages: Message[];
} {
  const selfIsAdmin = selfId === DEMO_ADMIN_ID;

  const messages: Message[] = SCRIPT.map((line, i): Message => {
    const senderId = line.from === "admin" ? DEMO_ADMIN_ID : DEMO_CLIENT_ID;
    const createdAt = isoAt(line.agoDays, line.at);
    return {
      id: `${DEMO_CONVERSATION_ID}-m${i + 1}`,
      conversation_id: DEMO_CONVERSATION_ID,
      sender_id: senderId,
      recipient_id: senderId === DEMO_ADMIN_ID ? DEMO_CLIENT_ID : DEMO_ADMIN_ID,
      body: line.body,
      created_at: createdAt,
      read_at: createdAt, // a finished exchange — nothing sits unread
      is_auto: false,
      kind: "chat",
      private_event_id: null,
    };
  });

  const last = messages[messages.length - 1];

  const conversation: ConversationWithPeer = {
    id: DEMO_CONVERSATION_ID,
    admin_id: DEMO_ADMIN_ID,
    client_id: DEMO_CLIENT_ID,
    created_at: messages[0].created_at,
    last_message_at: last.created_at,
    peer: selfIsAdmin
      ? { id: DEMO_CLIENT_ID, first_name: null, last_name: null, display_name: "Cassie", avatar_url: null }
      : { id: DEMO_ADMIN_ID, first_name: null, last_name: null, display_name: "Amanda", avatar_url: null },
    unread: 0,
    last_message: last.body,
  };

  return { conversation, messages };
}
