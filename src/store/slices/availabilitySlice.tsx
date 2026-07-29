import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import { supabase } from "@/lib/supabase.js";
import type { AvailabilityOverride, AvailabilityRule } from "@/models/globalTypes";

// ============================================================
// AVAILABILITY SLICE
//
// Holds the admin's recurring availability template (rules) plus
// one-off exceptions (overrides). The scheduler page expands these
// into calendar "window" events for the visible week.
//
// RLS scopes every row to the owning admin, so the fetch thunks
// don't need an explicit admin_id filter — Supabase only returns
// rows the caller owns. Inserts DO need admin_id set (the CHECK/
// NOT NULL requires it) so the create thunks take it as an argument.
// ============================================================

type AvailabilityState = {
  rules: AvailabilityRule[];
  overrides: AvailabilityOverride[];
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
};

const initialState: AvailabilityState = {
  rules: [],
  overrides: [],
  status: "idle",
  error: null,
};

// ─── Fetch (both tables in one thunk) ───────────────────────
export const fetchAvailability = createAsyncThunk<
  { rules: AvailabilityRule[]; overrides: AvailabilityOverride[] },
  void,
  { rejectValue: string }
>("availability/fetchAvailability", async (_, { rejectWithValue }) => {
  const [rulesRes, overridesRes] = await Promise.all([
    supabase.from("availability_rules").select("*").order("day_of_week").order("start_time"),
    supabase.from("availability_overrides").select("*").order("override_date"),
  ]);

  if (rulesRes.error) return rejectWithValue(rulesRes.error.message);
  if (overridesRes.error) return rejectWithValue(overridesRes.error.message);

  return { rules: rulesRes.data ?? [], overrides: overridesRes.data ?? [] };
});

// ─── Rules CRUD ─────────────────────────────────────────────
type CreateRulePayload = Omit<AvailabilityRule, "id" | "created_at">;

export const createRule = createAsyncThunk<AvailabilityRule, CreateRulePayload, { rejectValue: string }>(
  "availability/createRule",
  async (payload, { rejectWithValue }) => {
    const { data, error } = await supabase.from("availability_rules").insert(payload).select("*").single();
    if (error) return rejectWithValue(error.message);
    return data;
  },
);

export const updateRule = createAsyncThunk<
  AvailabilityRule,
  { id: string } & Partial<Pick<AvailabilityRule, "day_of_week" | "start_time" | "end_time" | "label">>,
  { rejectValue: string }
>("availability/updateRule", async ({ id, ...fields }, { rejectWithValue }) => {
  const { data, error } = await supabase.from("availability_rules").update(fields).eq("id", id).select("*").single();
  if (error) return rejectWithValue(error.message);
  return data;
});

export const deleteRule = createAsyncThunk<string, string, { rejectValue: string }>(
  "availability/deleteRule",
  async (id, { rejectWithValue }) => {
    const { error } = await supabase.from("availability_rules").delete().eq("id", id);
    if (error) return rejectWithValue(error.message);
    return id;
  },
);

// ─── Overrides CRUD ─────────────────────────────────────────
type CreateOverridePayload = Omit<AvailabilityOverride, "id" | "created_at">;

export const createOverride = createAsyncThunk<AvailabilityOverride, CreateOverridePayload, { rejectValue: string }>(
  "availability/createOverride",
  async (payload, { rejectWithValue }) => {
    const { data, error } = await supabase.from("availability_overrides").insert(payload).select("*").single();
    if (error) return rejectWithValue(error.message);
    return data;
  },
);

export const deleteOverride = createAsyncThunk<string, string, { rejectValue: string }>(
  "availability/deleteOverride",
  async (id, { rejectWithValue }) => {
    const { error } = await supabase.from("availability_overrides").delete().eq("id", id);
    if (error) return rejectWithValue(error.message);
    return id;
  },
);

const availabilitySlice = createSlice({
  name: "availability",
  initialState,
  reducers: {
    clearAvailabilityError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // ----- fetch
      .addCase(fetchAvailability.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchAvailability.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.rules = action.payload.rules;
        state.overrides = action.payload.overrides;
      })
      .addCase(fetchAvailability.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload ?? "Failed to load availability";
      })
      // ----- rules
      .addCase(createRule.fulfilled, (state, action) => {
        state.rules.push(action.payload);
        state.rules.sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time));
      })
      .addCase(updateRule.fulfilled, (state, action) => {
        const i = state.rules.findIndex((r) => r.id === action.payload.id);
        if (i !== -1) state.rules[i] = action.payload;
      })
      .addCase(deleteRule.fulfilled, (state, action) => {
        state.rules = state.rules.filter((r) => r.id !== action.payload);
      })
      // ----- overrides
      .addCase(createOverride.fulfilled, (state, action) => {
        state.overrides.push(action.payload);
      })
      .addCase(deleteOverride.fulfilled, (state, action) => {
        state.overrides = state.overrides.filter((o) => o.id !== action.payload);
      })
      .addCase("RESET_ALL", () => initialState);
  },
});

export const { clearAvailabilityError } = availabilitySlice.actions;
export default availabilitySlice.reducer;
