import { createAsyncThunk, createSelector, createSlice } from "@reduxjs/toolkit";

import { supabase } from "@/lib/supabase.js";
import type { Session, SessionStatus } from "@/models/globalTypes.js";
import type { RootState } from "@/store/store";

type SessionsState = {
  sessions: Session[];
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
};

const initialState: SessionsState = {
  sessions: [],
  status: "idle",
  error: null,
};

type CreateSessionPayload = Omit<Session, "id" | "created_at" | "status">;
// Note: avoid using React hooks at module scope; to show toasts, handle in components or middleware

export const createSession = createAsyncThunk<Session, CreateSessionPayload>(
  "sessions/createSession",
  async (payload, { rejectWithValue }) => {
    const { data, error } = await supabase
      .from("sessions")
      .insert({ ...payload })
      .select("*")
      .single();

    if (error) {
      return rejectWithValue(error.message || "Failed to create session");
    }
    return data;
  },
);
export const fetchSessionsByClientId = createAsyncThunk<Session[], string>(
  "sessions/fetchSessionsByClientId",
  async (clientId, { rejectWithValue }) => {
    const { data, error } = await supabase.from("sessions").select("*").eq("client_id", clientId);

    if (error) return rejectWithValue(error.message ?? "Failed to get your sessions, sorry!");

    return data ?? [];
  },
);

export const deleteSession = createAsyncThunk<string, string>(
  "sessions/deleteSession",
  async (sessionId, { rejectWithValue }) => {
    const { error } = await supabase.from("sessions").delete().eq("id", sessionId);

    if (error) return rejectWithValue(error.message ?? "Something went wrong, could not delete");

    return sessionId;
  },
);

export const updateSession = createAsyncThunk<
  Session,
  { id: string } & Partial<
    Pick<
      Session,
      | "status"
      | "attended"
      | "paid"
      | "price_pence"
      | "notes"
      | "reference_code"
      | "scheduled_at"
      | "duration_minutes"
      | "location"
      | "address"
    >
  >
>("sessions/updateSession", async (sessionToUpdate, { rejectWithValue }) => {
  const { id, ...fields } = sessionToUpdate;
  const { data, error } = await supabase.from("sessions").update(fields).eq("id", id).select("*").single();

  if (error) return rejectWithValue(error.message || "Failed to update session. Please try again later");

  return data;
});

export const fetchAllSessions = createAsyncThunk<Session[], void, { rejectValue: string }>(
  "sessions/fetchAllSessions",
  async (_, { rejectWithValue }) => {
    const { data, error } = await supabase.from("sessions").select("*").order("scheduled_at", { ascending: false });
    if (error) return rejectWithValue(error?.message ?? "Something went wrong, could not get sessions!");

    return data ?? [];
  },
);

const sessionsSlice = createSlice({
  name: "session",
  initialState,
  reducers: {
    clearResponseError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      //-----fetch all sessions
      .addCase(fetchAllSessions.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchAllSessions.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.sessions = action.payload;
      })
      .addCase(fetchAllSessions.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload as string;
      })
      //-----fetch sessions by client
      .addCase(fetchSessionsByClientId.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchSessionsByClientId.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.sessions = action.payload.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
      })
      .addCase(fetchSessionsByClientId.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload as string;
      })
      //-----create session
      .addCase(createSession.pending, (state) => {
        state.status = "loading";
      })
      .addCase(createSession.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.sessions.push(action.payload);
        state.sessions.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
      })
      .addCase(createSession.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload as string;
      })
      //-----update session
      .addCase(updateSession.pending, (state) => {
        state.status = "loading";
      })
      .addCase(updateSession.fulfilled, (state, action) => {
        const targetIndex = state.sessions.findIndex((s) => s.id === action.payload.id);

        if (targetIndex !== -1) {
          state.sessions[targetIndex] = action.payload;
        }

        state.status = "succeeded";
      })
      .addCase(updateSession.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload as string;
      })
      //---------------delete session
      // Note: delete is a mutation, so it deliberately does NOT flip `status` to
      // "loading". Page-level guards (isPageStatusLoading) key off `status`, and
      // flipping it here made the whole page flash its loading skeleton on delete.
      .addCase(deleteSession.fulfilled, (state, action) => {
        // action.payload is the deleted session id (string)
        state.sessions = state.sessions.filter((s) => s.id !== action.payload);
      })
      .addCase(deleteSession.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase("RESET_ALL", () => initialState);
  },
});

export const { clearResponseError } = sessionsSlice.actions;
export default sessionsSlice.reducer;

// Returns a map of session id → creation-order number (1-based, stable across renders)
export const selectSessionNumberMap = createSelector(
  (state: RootState) => state.sessions.sessions,
  (sessions) => {
    const sorted = [...sessions].sort((a, b) => a.created_at.localeCompare(b.created_at));
    return new Map<string, number>(sorted.map((s, i) => [s.id, i + 1]));
  },
);
