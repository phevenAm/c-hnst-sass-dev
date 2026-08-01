import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import { supabase } from "@/lib/supabase.js";
import type { AdminPrivateEvent } from "@/models/globalTypes";

// ============================================================
// ADMIN PRIVATE EVENTS SLICE
//
// The admin's own private calendar blocks (supervision, admin time,
// personal appointments). Rendered on /admin/scheduler only — the
// admin_private_events table has NO client-facing RLS policy, so clients
// can never read these. RLS scopes every row to the owning admin, so the
// fetch thunk needs no admin_id filter; inserts DO set admin_id (NOT NULL).
// ============================================================

type AdminPrivateEventsState = {
  events: AdminPrivateEvent[];
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
};

const initialState: AdminPrivateEventsState = {
  events: [],
  status: "idle",
  error: null,
};

export const fetchPrivateEvents = createAsyncThunk<AdminPrivateEvent[], void, { rejectValue: string }>(
  "adminPrivateEvents/fetch",
  async (_, { rejectWithValue }) => {
    const { data, error } = await supabase.from("admin_private_events").select("*").order("starts_at");
    if (error) return rejectWithValue(error.message);
    return data ?? [];
  },
);

type CreatePrivateEventPayload = Omit<AdminPrivateEvent, "id" | "created_at">;

export const createPrivateEvent = createAsyncThunk<
  AdminPrivateEvent,
  CreatePrivateEventPayload,
  { rejectValue: string }
>("adminPrivateEvents/create", async (payload, { rejectWithValue }) => {
  const { data, error } = await supabase.from("admin_private_events").insert(payload).select("*").single();
  if (error) return rejectWithValue(error.message);
  return data;
});

export const updatePrivateEvent = createAsyncThunk<
  AdminPrivateEvent,
  { id: string } & Partial<Pick<AdminPrivateEvent, "title" | "starts_at" | "ends_at" | "notes">>,
  { rejectValue: string }
>("adminPrivateEvents/update", async ({ id, ...fields }, { rejectWithValue }) => {
  const { data, error } = await supabase.from("admin_private_events").update(fields).eq("id", id).select("*").single();
  if (error) return rejectWithValue(error.message);
  return data;
});

export const deletePrivateEvent = createAsyncThunk<string, string, { rejectValue: string }>(
  "adminPrivateEvents/delete",
  async (id, { rejectWithValue }) => {
    const { error } = await supabase.from("admin_private_events").delete().eq("id", id);
    if (error) return rejectWithValue(error.message);
    return id;
  },
);

const adminPrivateEventsSlice = createSlice({
  name: "adminPrivateEvents",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchPrivateEvents.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchPrivateEvents.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.events = action.payload;
      })
      .addCase(fetchPrivateEvents.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload ?? "Failed to load private events";
      })
      .addCase(createPrivateEvent.fulfilled, (state, action) => {
        state.events.push(action.payload);
        state.events.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
      })
      .addCase(updatePrivateEvent.fulfilled, (state, action) => {
        const i = state.events.findIndex((e) => e.id === action.payload.id);
        if (i !== -1) state.events[i] = action.payload;
        state.events.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
      })
      .addCase(deletePrivateEvent.fulfilled, (state, action) => {
        state.events = state.events.filter((e) => e.id !== action.payload);
      })
      .addCase("RESET_ALL", () => initialState);
  },
});

export default adminPrivateEventsSlice.reducer;
