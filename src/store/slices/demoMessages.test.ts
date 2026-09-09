import { describe, expect, it } from "vitest";

import { buildDemoMessaging, DEMO_ADMIN_ID, DEMO_CLIENT_ID, DEMO_CONVERSATION_ID } from "./demoMessages";

describe("buildDemoMessaging", () => {
  it("returns a multi-message exchange in strict chronological order over the last few days", () => {
    const { messages } = buildDemoMessaging(DEMO_CLIENT_ID);

    expect(messages.length).toBeGreaterThanOrEqual(4);

    const times = messages.map((m) => new Date(m.created_at).getTime());
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThan(times[i - 1]);
    }

    const now = Date.now();
    expect(times[0]).toBeGreaterThan(now - 8 * 86_400_000); // within the last week
    expect(times[times.length - 1]).toBeLessThanOrEqual(now);
  });

  it("ties every message to the one demo conversation and to the two demo accounts", () => {
    const { conversation, messages } = buildDemoMessaging(DEMO_CLIENT_ID);

    expect(conversation.id).toBe(DEMO_CONVERSATION_ID);
    expect(conversation.admin_id).toBe(DEMO_ADMIN_ID);
    expect(conversation.client_id).toBe(DEMO_CLIENT_ID);

    for (const m of messages) {
      expect(m.conversation_id).toBe(DEMO_CONVERSATION_ID);
      expect([DEMO_ADMIN_ID, DEMO_CLIENT_ID]).toContain(m.sender_id);
      expect(m.recipient_id).toBe(m.sender_id === DEMO_ADMIN_ID ? DEMO_CLIENT_ID : DEMO_ADMIN_ID);
      expect(m.kind).toBe("chat");
      expect(m.read_at).not.toBeNull();
    }
  });

  it("includes both scripted beats — the invoice/paid note and the emergency cancellation", () => {
    const bodies = buildDemoMessaging(DEMO_ADMIN_ID).messages.map((m) => m.body.toLowerCase());
    expect(bodies.some((b) => b.includes("invoice") && b.includes("paid"))).toBe(true);
    expect(bodies.some((b) => b.includes("emergency") && b.includes("cancel"))).toBe(true);
  });

  it("presents the peer as the other party — Amanda for the client, Cassie for the admin", () => {
    expect(buildDemoMessaging(DEMO_CLIENT_ID).conversation.peer).toMatchObject({
      id: DEMO_ADMIN_ID,
      display_name: "Amanda",
    });
    expect(buildDemoMessaging(DEMO_ADMIN_ID).conversation.peer).toMatchObject({
      id: DEMO_CLIENT_ID,
      display_name: "Cassie",
    });
  });

  it("sets the conversation preview + timestamp from the final message", () => {
    const { conversation, messages } = buildDemoMessaging(DEMO_CLIENT_ID);
    const last = messages[messages.length - 1];
    expect(conversation.last_message).toBe(last.body);
    expect(conversation.last_message_at).toBe(last.created_at);
    expect(conversation.unread).toBe(0);
  });
});
