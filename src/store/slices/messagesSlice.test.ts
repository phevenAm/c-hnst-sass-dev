import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";

import messagesReducer, {
  markConversationRead,
  messageReceived,
  selectTotalUnread,
  sendMessage,
} from "./messagesSlice";

// The slice's realtime + optimistic-send bookkeeping is the part with edges:
// a received message bumps the thread + conversation and only counts as unread
// when its thread isn't the one on screen; a sent message never inflates the
// unread count; marking read zeroes it and back-fills read_at locally.

vi.mock("../../lib/supabase.js", () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), auth: { getUser: vi.fn() } } }));

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
