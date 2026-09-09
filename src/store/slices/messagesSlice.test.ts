import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";

import { supabase } from "../../lib/supabase.js";
import { DEMO_ADMIN_ID, DEMO_CLIENT_ID, DEMO_CONVERSATION_ID } from "./demoMessages";
import messagesReducer, {
  demoDataLoaded,
  demoMessageSent,
  markConversationRead,
  messageReceived,
  mirrorPrivateEvent,
  selectTotalUnread,
  sendMessage,
} from "./messagesSlice";

// The slice's realtime + optimistic-send bookkeeping is the part with edges:
// a received message bumps the thread + conversation and only counts as unread
// when its thread isn't the one on screen; a sent message never inflates the
// unread count; marking read zeroes it and back-fills read_at locally.

vi.mock("../../lib/supabase.js", () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
    auth: { getUser: vi.fn() },
    functions: { invoke: vi.fn(() => Promise.resolve({ data: null, error: null })) },
  },
}));

type S = ReturnType<typeof makeStore>["getState"];

const convo = (over: Record<string, unknown> = {}) => ({
  id: "conv-1",
  admin_id: "admin-1",
  client_id: "client-1",
  created_at: "2026-09-01T00:00:00Z",
  last_message_at: "2026-09-01T00:00:00Z",
  peer: { id: "client-1", first_name: "Sam", last_name: "Lee", display_name: null, avatar_url: null },
  unread: 0,
  last_message: null,
  ...over,
});

const msg = (over: Record<string, unknown> = {}) => ({
  id: "m1",
  conversation_id: "conv-1",
  sender_id: "client-1",
  recipient_id: "admin-1",
  body: "hello",
  created_at: "2026-09-02T09:00:00Z",
  read_at: null,
  ...over,
});

function makeStore(preloaded?: Record<string, unknown>) {
  return configureStore({
    reducer: { messages: messagesReducer },
    preloadedState: preloaded ? { messages: preloaded } : undefined,
  });
}

const baseState = {
  conversations: [convo()],
  conversationsStatus: "succeeded" as const,
  threads: { "conv-1": [] as ReturnType<typeof msg>[] },
  threadStatus: { "conv-1": "succeeded" as const },
  error: null,
};

describe("messagesSlice — messageReceived", () => {
  it("appends to a loaded thread and bumps the conversation preview", () => {
    const store = makeStore(structuredClone(baseState));
    store.dispatch(messageReceived({ message: msg(), activeConversationId: "conv-1" }));

    const state = store.getState() as S;
    expect(state.messages.threads["conv-1"]).toHaveLength(1);
    expect(state.messages.conversations[0].last_message).toBe("hello");
    expect(state.messages.conversations[0].last_message_at).toBe("2026-09-02T09:00:00Z");
  });

  it("does not increment unread when the message's thread is open", () => {
    const store = makeStore(structuredClone(baseState));
    store.dispatch(messageReceived({ message: msg(), activeConversationId: "conv-1" }));
    expect((store.getState() as S).messages.conversations[0].unread).toBe(0);
  });

  it("increments unread when a different thread (or none) is open", () => {
    const store = makeStore(structuredClone(baseState));
    store.dispatch(messageReceived({ message: msg(), activeConversationId: null }));
    expect((store.getState() as S).messages.conversations[0].unread).toBe(1);
  });

  it("ignores a duplicate message id in the thread", () => {
    const store = makeStore(structuredClone(baseState));
    store.dispatch(messageReceived({ message: msg(), activeConversationId: null }));
    store.dispatch(messageReceived({ message: msg(), activeConversationId: null }));
    expect((store.getState() as S).messages.threads["conv-1"]).toHaveLength(1);
  });
});

describe("messagesSlice — sendMessage.fulfilled", () => {
  it("adds the sent message to the thread without touching unread", () => {
    const store = makeStore(structuredClone({ ...baseState, conversations: [convo({ unread: 3 })] }));
    store.dispatch({ type: sendMessage.fulfilled.type, payload: msg({ id: "m2", sender_id: "admin-1" }) });

    const state = store.getState() as S;
    expect(state.messages.threads["conv-1"]).toHaveLength(1);
    expect(state.messages.conversations[0].unread).toBe(3);
    expect(state.messages.conversations[0].last_message).toBe("hello");
  });
});

describe("messagesSlice — markConversationRead.fulfilled", () => {
  it("zeroes the conversation unread and back-fills read_at on the thread", () => {
    const store = makeStore(
      structuredClone({
        ...baseState,
        conversations: [convo({ unread: 4 })],
        threads: { "conv-1": [msg(), msg({ id: "m2" })] },
      }),
    );
    store.dispatch({ type: markConversationRead.fulfilled.type, payload: "conv-1" });

    const state = store.getState() as S;
    expect(state.messages.conversations[0].unread).toBe(0);
    expect(state.messages.threads["conv-1"].every((m) => m.read_at)).toBe(true);
  });
});

describe("messagesSlice — mirrorPrivateEvent", () => {
  const rpc = vi.mocked(supabase.rpc);
  const invoke = vi.mocked(supabase.functions.invoke);

  it("calls the fan-out RPC with trimmed body and pokes notify-new-message per written row", async () => {
    rpc.mockImplementation((name: string) => {
      if (name === "mirror_private_event_to_clients") {
        return Promise.resolve({
          data: [
            { message_id: "m-a", conversation_id: "c-a" },
            { message_id: "m-b", conversation_id: "c-b" },
          ],
          error: null,
        }) as never;
      }
      return Promise.resolve({ data: [], error: null }) as never; // list_my_conversations
    });

    const store = makeStore(structuredClone(baseState));
    const res = await store.dispatch(
      mirrorPrivateEvent({ eventId: "evt-1", clientIds: ["client-1", "client-2"], body: "  heads up  " }),
    );

    expect(mirrorPrivateEvent.fulfilled.match(res)).toBe(true);
    expect(res.payload).toEqual({ count: 2 });
    expect(rpc).toHaveBeenCalledWith("mirror_private_event_to_clients", {
      p_event_id: "evt-1",
      p_client_ids: ["client-1", "client-2"],
      p_body: "heads up",
    });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenCalledWith("notify-new-message", { body: { message_id: "m-a" } });
    expect(invoke).toHaveBeenCalledWith("notify-new-message", { body: { message_id: "m-b" } });
  });

  it("rejects with the RPC error and sends no notifications", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "not your private event" } } as never);
    invoke.mockClear();

    const store = makeStore(structuredClone(baseState));
    const res = await store.dispatch(mirrorPrivateEvent({ eventId: "evt-x", clientIds: ["client-1"], body: "hi" }));

    expect(mirrorPrivateEvent.rejected.match(res)).toBe(true);
    expect(res.payload).toBe("not your private event");
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("messagesSlice — demoDataLoaded", () => {
  it("replaces any real conversation list + thread with the scripted demo exchange", () => {
    const store = makeStore(
      structuredClone({
        ...baseState,
        conversations: [convo({ id: "real-1" }), convo({ id: "real-2" })],
        threads: { "real-1": [msg()] },
      }),
    );

    store.dispatch(demoDataLoaded(DEMO_CLIENT_ID));

    const state = store.getState() as S;
    expect(state.messages.conversations).toHaveLength(1);
    expect(state.messages.conversations[0].id).toBe(DEMO_CONVERSATION_ID);
    expect(state.messages.conversationsStatus).toBe("succeeded");
    expect(state.messages.threads).toEqual({ [DEMO_CONVERSATION_ID]: expect.any(Array) });
    expect(state.messages.threadStatus[DEMO_CONVERSATION_ID]).toBe("succeeded");
    expect(state.messages.threads[DEMO_CONVERSATION_ID].length).toBeGreaterThan(1);
  });

  it("shows the counsellor (Amanda) as the peer when the demo client is signed in", () => {
    const store = makeStore(structuredClone(baseState));
    store.dispatch(demoDataLoaded(DEMO_CLIENT_ID));
    expect((store.getState() as S).messages.conversations[0].peer.id).toBe(DEMO_ADMIN_ID);
  });

  it("shows the client (Cassie) as the peer when the demo admin is signed in", () => {
    const store = makeStore(structuredClone(baseState));
    store.dispatch(demoDataLoaded(DEMO_ADMIN_ID));
    expect((store.getState() as S).messages.conversations[0].peer.id).toBe(DEMO_CLIENT_ID);
  });

  it("leaves nothing unread — a finished exchange", () => {
    const store = makeStore(structuredClone(baseState));
    store.dispatch(demoDataLoaded(DEMO_CLIENT_ID));
    const state = store.getState() as S;
    expect(state.messages.conversations[0].unread).toBe(0);
    expect(state.messages.threads[DEMO_CONVERSATION_ID].every((m) => m.read_at)).toBe(true);
  });
});

describe("messagesSlice — demoMessageSent", () => {
  it("echoes the message into the thread locally without inflating unread", () => {
    const store = makeStore(structuredClone(baseState));
    store.dispatch(demoDataLoaded(DEMO_CLIENT_ID));
    const before = (store.getState() as S).messages.threads[DEMO_CONVERSATION_ID].length;

    store.dispatch(
      demoMessageSent({
        conversationId: DEMO_CONVERSATION_ID,
        senderId: DEMO_CLIENT_ID,
        recipientId: DEMO_ADMIN_ID,
        body: "  see you then  ",
      }),
    );

    const state = store.getState() as S;
    const thread = state.messages.threads[DEMO_CONVERSATION_ID];
    expect(thread).toHaveLength(before + 1);
    expect(thread[thread.length - 1].body).toBe("see you then");
    expect(thread[thread.length - 1].sender_id).toBe(DEMO_CLIENT_ID);
    expect(state.messages.conversations[0].last_message).toBe("see you then");
    expect(state.messages.conversations[0].unread).toBe(0);
  });
});

describe("messagesSlice — selectTotalUnread", () => {
  it("sums unread across conversations", () => {
    const store = makeStore(
      structuredClone({
        ...baseState,
        conversations: [convo({ id: "a", unread: 2 }), convo({ id: "b", unread: 5 })],
      }),
    );
    expect(selectTotalUnread(store.getState() as S)).toBe(7);
  });
});
