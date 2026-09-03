import { createAsyncThunk, createSelector, createSlice } from "@reduxjs/toolkit";

import { supabase } from "@/lib/supabase.js";
import type { Session, SessionBlockMeta } from "@/models/globalTypes.js";
import type { RootState } from "@/store/store";

type SessionsState = {
  sessions: Session[];
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
  // What the current `sessions` array actually holds: the whole practice
  // ("all"), or just one client's rows ("client:<id>"), or nothing yet.
  // fetchSessionsByClientId and fetchAllSessions both replace `sessions`
  // wholesale and both set status "succeeded", so pages that need the full
  // set (scheduler, dashboard, payments) can't tell a client-scoped load
  // apart from a real one without this — they'd render a partial calendar
  // until a hard refresh.
  scope: "none" | "all" | `client:${string}`;
};

const initialState: SessionsState = {
  sessions: [],
  status: "idle",
  error: null,
  scope: "none",
};

const byScheduledAt = (a: Session, b: Session) => a.scheduled_at.localeCompare(b.scheduled_at);

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
    upsertSession: (state, action: { payload: Session }) => {
      const idx = state.sessions.findIndex((s) => s.id === action.payload.id);
      if (idx !== -1) {
        state.sessions[idx] = action.payload;
      } else {
        state.sessions.push(action.payload);
      }
      // Re-sort on every upsert, not just inserts — an existing session's
      // scheduled_at can change (this is exactly what a reschedule is), and
      // it needs to move to its new chronological position, not stay put.
      state.sessions.sort(byScheduledAt);
    },
    // Drop a session from local state — used by the realtime DELETE feed so a
    // session removed elsewhere disappears without a manual reload.
    removeSession: (state, action: { payload: string }) => {
      state.sessions = state.sessions.filter((s) => s.id !== action.payload);
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
        state.sessions = [...action.payload].sort(byScheduledAt);
        state.scope = "all";
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
        state.sessions = action.payload.sort(byScheduledAt);
        state.scope = `client:${action.meta.arg}`;
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
        state.sessions.sort(byScheduledAt);
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
          // A reschedule changes scheduled_at in place — without re-sorting,
          // the session stays at its old list position instead of moving to
          // reflect the new date/time.
          state.sessions.sort(byScheduledAt);
        }

        // The DB's cascade_block_payment trigger propagates a paid-status
        // change to every sibling in the block server-side, but that only
        // reaches this client's Redux state via N separate realtime events
        // landing later — meanwhile every tab in a BlockSessionCard derives
        // its "all paid" state from what's in here right now, so without
        // this the other tabs would sit stale until realtime catches up (or
        // never visibly resolve if it doesn't). Mirror the trigger's own
        // logic locally so the UI is correct immediately; the realtime
        // events that follow are then just harmless no-op confirmations.
        const blockId = (action.payload.metadata as SessionBlockMeta | null)?.block_id;
        if (blockId && action.payload.client_id) {
          for (const s of state.sessions) {
            if (
              s.id !== action.payload.id &&
              s.client_id === action.payload.client_id &&
              (s.metadata as SessionBlockMeta | null)?.block_id === blockId
            ) {
              s.paid = action.payload.paid;
              s.paid_at = action.payload.paid_at;
              if (action.payload.paid && s.manual_payment_status === "pending") s.manual_payment_status = "approved";
              if (!action.payload.paid && s.manual_payment_status === "approved") s.manual_payment_status = "none";
            }
          }
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

export const { clearResponseError, upsertSession, removeSession } = sessionsSlice.actions;
export default sessionsSlice.reducer;

// Returns a map of session id → creation-order number (1-based, stable across renders)
export const selectSessionNumberMap = createSelector(
  (state: RootState) => state.sessions.sessions,
  (sessions) => {
    const sorted = [...sessions].sort((a, b) => a.created_at.localeCompare(b.created_at));
    return new Map<string, number>(sorted.map((s, i) => [s.id, i + 1]));
  },
);
