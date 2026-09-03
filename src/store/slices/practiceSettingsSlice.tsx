import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import { supabase } from "@/lib/supabase.js";
import type { Tables } from "@/models/database.types";

// ============================================================
// PRACTICE SETTINGS SLICE
//
// Single shared cache for the columns of practice_settings that get read
// on nearly every page load (Navbar's logo, InterfacePrefsContext's hidden
// sections, PaymentModal's bank details, AuthContext's subscription/plan
// fields, etc.) — before this slice, each of those fetched independently,
// which meant 5-7 near-duplicate requests for the same row queuing up
// behind Supabase's per-request concurrency limit on a single page load.
//
// RLS scopes SELECT to exactly one row for any caller — admins see their
// own row, clients see their own admin's row (see
// 20260819000002_fix_practice_settings_rls_leak.sql) — so the fetch below
// needs no explicit admin_id filter; whichever row the caller is allowed to
// see is the right one.
//
// Deliberately excludes enc_* (note-encryption key material) and the raw
// Stripe/billing internal IDs: those are more sensitive, admin-managed
// concerns with their own existing state machine (EncryptionContext) or no
// current UI need — no reason to widen every consumer's exposure to them
// just because they live in the same row.
//
// Freshness: usePracticeSettingsRealtime (Hooks/) subscribes to UPDATE
// events on this row and re-dispatches fetchPracticeSettings so every open
// tab — the admin's own other tabs, and any client viewing their data —
// picks up a change within moments of it being saved, not just on reload.
// ============================================================

export type PracticeSettingsCache = Pick<
  Tables<"practice_settings">,
  | "admin_id"
  | "business_name"
  | "onboarding_required"
  | "subscription_status"
  | "subscription_plan"
  | "stripe_connect_onboarded"
  | "card_payments_enabled"
  | "use_client_codenames"
  | "reschedule_cutoff_hours"
  | "allow_block_session_cancellation"
  | "session_buffer_minutes"
  | "hidden_sections"
  | "reduce_motion"
  | "logo_url"
  | "counsellor_name"
  | "bank_name"
  | "bank_account_name"
  | "bank_sort_code"
  | "bank_account_number"
  | "bank_payment_reference"
  | "cpd_annual_target_hours"
  | "saved_locations"
  | "is_paused"
  | "paused_reason"
  | "referral_code"
  | "first_client_milestone_shown"
  | "consent_enabled"
  | "hide_client_profile_pii"
  | "invoice_prefix"
  | "next_invoice_number"
>;

const SELECT_COLUMNS =
  "admin_id, business_name, onboarding_required, subscription_status, subscription_plan, stripe_connect_onboarded, card_payments_enabled, use_client_codenames, reschedule_cutoff_hours, allow_block_session_cancellation, session_buffer_minutes, hidden_sections, reduce_motion, logo_url, counsellor_name, bank_name, bank_account_name, bank_sort_code, bank_account_number, bank_payment_reference, cpd_annual_target_hours, saved_locations, is_paused, paused_reason, referral_code, first_client_milestone_shown, consent_enabled, hide_client_profile_pii, invoice_prefix, next_invoice_number";

type PracticeSettingsState = {
  data: PracticeSettingsCache | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
};

const initialState: PracticeSettingsState = {
  data: null,
  status: "idle",
  error: null,
};

export const fetchPracticeSettings = createAsyncThunk<PracticeSettingsCache | null, void, { rejectValue: string }>(
  "practiceSettings/fetch",
  async (_, { rejectWithValue }) => {
    const { data, error } = await supabase.from("practice_settings").select(SELECT_COLUMNS).maybeSingle();
    if (error) return rejectWithValue(error.message);
    return data as PracticeSettingsCache | null;
  },
);

const practiceSettingsSlice = createSlice({
  name: "practiceSettings",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchPracticeSettings.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchPracticeSettings.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.data = action.payload;
      })
      .addCase(fetchPracticeSettings.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload ?? "Failed to load practice settings";
      })
      .addCase("RESET_ALL", () => initialState);
  },
});

export default practiceSettingsSlice.reducer;
