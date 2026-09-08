import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { supabase } from "../../lib/supabase.js";
import type { Conversation, ConversationWithPeer, Message } from "../../models/globalTypes";

type LoadStatus = "idle" | "loading" | "succeeded" | "failed";

type MessagesState = {
  conversations: ConversationWithPeer[];
  conversationsStatus: LoadStatus;
  threads: Record<string, Message[]>;
  threadStatus: Record<string, LoadStatus>;
  error: string | null;
};

const initialState: MessagesState = {
  conversations: [],
  conversationsStatus: "idle",
  threads: {},
  threadStatus: {},
  error: null,
};

type RawConversationRow = {
  id: string;
  admin_id: string;
  client_id: string;
  created_at: string;
  last_message_at: string;
  peer_id: string;
  peer_first_name: string | null;
  peer_last_name: string | null;
  peer_display_name: string | null;
  peer_avatar_url: string | null;
  unread: number;
  last_message: string | null;
};

const toConversation = (r: RawConversationRow): ConversationWithPeer => ({
  id: r.id,
  admin_id: r.admin_id,
  client_id: r.client_id,
  created_at: r.created_at,
  last_message_at: r.last_message_at,
  peer: {
    id: r.peer_id,
    first_name: r.peer_first_name,
    last_name: r.peer_last_name,
    display_name: r.peer_display_name,
    avatar_url: r.peer_avatar_url,
  },
  unread: Number(r.unread) || 0,
  last_message: r.last_message,
});

export const fetchConversations = createAsyncThunk("messages/fetchConversations", async (_, { rejectWithValue }) => {
  const { data, error } = await supabase.rpc("list_my_conversations");
  if (error) return rejectWithValue(error.message);
  return (data as RawConversationRow[]).map(toConversation);
});

export const fetchThread = createAsyncThunk(
  "messages/fetchThread",
  async (conversationId: string, { rejectWithValue }) => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (error) return rejectWithValue(error.message);
    return { conversationId, messages: data as Message[] };
  },
);

export const sendMessage = createAsyncThunk(
  "messages/sendMessage",
  async (
    { conversationId, recipientId, body }: { conversationId: string; recipientId: string; body: string },
    { rejectWithValue },
  ) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return rejectWithValue("Not signed in");

    const { data, error } = await supabase
      .from("messages")
      .insert({ conversation_id: conversationId, sender_id: user.id, recipient_id: recipientId, body: body.trim() })
      .select()
      .single();
    if (error) return rejectWithValue(error.message);
    return data as Message;
  },
);

export const markConversationRead = createAsyncThunk(
  "messages/markRead",
  async (conversationId: string, { rejectWithValue }) => {
    const { error } = await supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId });
    if (error) return rejectWithValue(error.message);
    return conversationId;
  },
);

// Resolve (or create) the thread for an (admin, client) pair, then load it.
export const openConversation = createAsyncThunk(
  "messages/openConversation",
  async ({ adminId, clientId }: { adminId: string; clientId: string }, { rejectWithValue, dispatch }) => {
    const { data, error } = await supabase.rpc("get_or_create_conversation", {
      p_admin_id: adminId,
      p_client_id: clientId,
    });
    if (error) return rejectWithValue(error.message);
    const conversationId = data as string;
    dispatch(fetchConversations());
    dispatch(fetchThread(conversationId));
    return conversationId;
  },
);

const messagesSlice = createSlice({
  name: "messages",
  initialState,
  reducers: {
    // A message arrived over realtime (the caller is its recipient).
    messageReceived(state, action: PayloadAction<{ message: Message; activeConversationId: string | null }>) {
      const { message, activeConversationId } = action.payload;
      const thread = state.threads[message.conversation_id];
      if (thread && !thread.some((m) => m.id === message.id)) {
        thread.push(message);
      }
      const convo = state.conversations.find((c) => c.id === message.conversation_id);
      if (convo) {
        convo.last_message = message.body;
        convo.last_message_at = message.created_at;
        if (message.conversation_id !== activeConversationId) convo.unread += 1;
        state.conversations.sort(
          (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime(),
        );
      } else {
        // First message of a brand-new thread — pull the list so the peer shows.
        state.conversationsStatus = "idle";
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchConversations.pending, (state) => {
        state.conversationsStatus = "loading";
      })
      .addCase(fetchConversations.fulfilled, (state, action) => {
        state.conversationsStatus = "succeeded";
        state.conversations = action.payload;
      })
      .addCase(fetchConversations.rejected, (state, action) => {
        state.conversationsStatus = "failed";
        state.error = action.payload as string;
      })
      .addCase(fetchThread.pending, (state, action) => {
        state.threadStatus[action.meta.arg] = "loading";
      })
      .addCase(fetchThread.fulfilled, (state, action) => {
        state.threadStatus[action.payload.conversationId] = "succeeded";
        state.threads[action.payload.conversationId] = action.payload.messages;
      })
      .addCase(fetchThread.rejected, (state, action) => {
        state.threadStatus[action.meta.arg] = "failed";
        state.error = action.payload as string;
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        const msg = action.payload;
        if (!state.threads[msg.conversation_id]) state.threads[msg.conversation_id] = [];
        const thread = state.threads[msg.conversation_id];
        if (!thread.some((m) => m.id === msg.id)) thread.push(msg);
        const convo = state.conversations.find((c) => c.id === msg.conversation_id);
        if (convo) {
          convo.last_message = msg.body;
          convo.last_message_at = msg.created_at;
          state.conversations.sort(
            (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime(),
          );
        }
      })
      .addCase(markConversationRead.fulfilled, (state, action) => {
        const convo = state.conversations.find((c) => c.id === action.payload);
        if (convo) convo.unread = 0;
        const thread = state.threads[action.payload];
        if (thread) {
          const now = new Date().toISOString();
          for (const m of thread) if (!m.read_at) m.read_at = now;
        }
      })
      .addCase("RESET_ALL", () => initialState);
  },
});

export const { messageReceived } = messagesSlice.actions;
export default messagesSlice.reducer;

type WithMessages = { messages: MessagesState };

export const selectConversations = (s: WithMessages) => s.messages.conversations;
export const selectConversationsStatus = (s: WithMessages) => s.messages.conversationsStatus;
export const selectThread = (conversationId: string) => (s: WithMessages) => s.messages.threads[conversationId] ?? [];
export const selectThreadStatus = (conversationId: string) => (s: WithMessages) =>
  s.messages.threadStatus[conversationId] ?? "idle";
export const selectTotalUnread = (s: WithMessages) => s.messages.conversations.reduce((sum, c) => sum + c.unread, 0);
export const selectConversationById = (conversationId: string) => (s: WithMessages) =>
  s.messages.conversations.find((c) => c.id === conversationId) ?? null;

export type { Conversation, ConversationWithPeer };
