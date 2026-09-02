import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import { supabase } from "../../lib/supabase.js";
import type {
  Agency,
  AgencyClient,
  AgencyExpense,
  AgencyMember,
  AgencyMemberWithUser,
  AgencyOnboardingItem,
  ClientAssignment,
} from "../../models/agency";

type Status = "idle" | "loading" | "succeeded" | "failed";

type AgencyState = {
  // Current user's own place in an agency (null once bootstrap says they're not in one).
  membership: AgencyMember | null;
  agency: Agency | null;
  bootstrapStatus: Status;

  members: AgencyMemberWithUser[];
  membersStatus: Status;

  clients: AgencyClient[];
  clientsStatus: Status;

  // Pending intakes handed to the current admin, for the review flow.
  incoming: (ClientAssignment & { client_name: string })[];
  incomingStatus: Status;

  expenses: AgencyExpense[];
  onboardingItems: AgencyOnboardingItem[];

  error: string | null;
};

const initialState: AgencyState = {
  membership: null,
  agency: null,
  bootstrapStatus: "idle",
  members: [],
  membersStatus: "idle",
  clients: [],
  clientsStatus: "idle",
  incoming: [],
  incomingStatus: "idle",
  expenses: [],
  onboardingItems: [],
  error: null,
};

// ── Reads ──────────────────────────────────────────────────────────────────

export const bootstrapAgency = createAsyncThunk("agency/bootstrap", async (_, { rejectWithValue }) => {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return { membership: null, agency: null };

  const { data: membership, error: mErr } = await supabase
    .from("agency_members")
    .select("*")
    .eq("user_id", uid)
    .maybeSingle();
  if (mErr) return rejectWithValue(mErr.message);
  if (!membership) return { membership: null, agency: null };

  const { data: agency, error: aErr } = await supabase
    .from("agencies")
    .select("*")
    .eq("id", membership.agency_id)
    .maybeSingle();
  if (aErr) return rejectWithValue(aErr.message);

  return { membership: membership as AgencyMember, agency: (agency as Agency) ?? null };
});

export const fetchAgencyMembers = createAsyncThunk("agency/fetchMembers", async (_, { rejectWithValue }) => {
  // agency_members.user_id FKs auth.users, which PostgREST can't embed — fetch
  // the member rows and their public.users profiles separately, then merge.
  const { data: members, error } = await supabase
    .from("agency_members")
    .select("*")
    .order("joined_at", { ascending: true });
  if (error) return rejectWithValue(error.message);

  // public.users has no email / avatar_url column (those live on auth.users) —
  // selecting them 400s the whole query.
  const ids = (members ?? []).map((m) => (m as AgencyMember).user_id);
  const profiles = ids.length
    ? ((await supabase.from("users").select("id, first_name, last_name, display_name").in("id", ids)).data ?? [])
    : [];
  const byId = new Map(profiles.map((p) => [(p as { id: string }).id, p as Record<string, string | null>]));

  return (members ?? []).map((row): AgencyMemberWithUser => {
    const m = row as AgencyMember;
    const u = byId.get(m.user_id) ?? {};
    return {
      ...m,
      first_name: u.first_name ?? null,
      last_name: u.last_name ?? null,
      display_name: u.display_name ?? null,
      email: null,
      avatar_url: null,
    };
  });
});

export const fetchAgencyClients = createAsyncThunk(
  "agency/fetchClients",
  async (agencyId: string, { rejectWithValue }) => {
    const [{ data: stubs, error: sErr }, { data: assignments, error: aErr }] = await Promise.all([
      supabase
        .from("client_stubs")
        .select(
          "id, first_name, last_name, email, codename, agency_id, default_rate_pence, availability_note, created_by, created_at, linked_user_id",
        )
        .eq("agency_id", agencyId)
        .order("created_at", { ascending: false }),
      supabase.from("client_assignments").select("*").eq("agency_id", agencyId),
    ]);
    if (sErr) return rejectWithValue(sErr.message);
    if (aErr) return rejectWithValue(aErr.message);

    const liveByStub = new Map<string, ClientAssignment>();
    for (const a of (assignments ?? []) as ClientAssignment[]) {
      if (a.status === "pending" || a.status === "accepted") liveByStub.set(a.stub_id, a);
    }
    return ((stubs ?? []) as Omit<AgencyClient, "assignment">[]).map((s) => ({
      ...s,
      assignment: liveByStub.get(s.id) ?? null,
    }));
  },
);

export const fetchIncomingAssignments = createAsyncThunk("agency/fetchIncoming", async (_, { rejectWithValue }) => {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return [];
  const { data, error } = await supabase
    .from("client_assignments")
    .select("*, client_stubs:stub_id (first_name, last_name)")
    .eq("to_admin_id", uid)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) return rejectWithValue(error.message);
  return (data ?? []).map((row) => {
    const s = (row as { client_stubs?: { first_name?: string; last_name?: string } }).client_stubs ?? {};
    const { client_stubs: _s, ...a } = row as ClientAssignment & { client_stubs?: unknown };
    return { ...(a as ClientAssignment), client_name: `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || "Client" };
  });
});

export const fetchAgencyExpenses = createAsyncThunk("agency/fetchExpenses", async (_, { rejectWithValue }) => {
  const { data, error } = await supabase.from("agency_expenses").select("*").order("incurred_on", { ascending: false });
  if (error) return rejectWithValue(error.message);
  return (data ?? []) as AgencyExpense[];
});

export const fetchOnboardingItems = createAsyncThunk("agency/fetchOnboarding", async (_, { rejectWithValue }) => {
  const { data, error } = await supabase
    .from("agency_onboarding_items")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) return rejectWithValue(error.message);
  return (data ?? []) as AgencyOnboardingItem[];
});

// ── Writes: edge functions ─────────────────────────────────────────────────

async function invokeOrThrow<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    // Edge functions return { error } with a 4xx/5xx — surface that message.
    const ctx = (error as { context?: { body?: unknown } }).context;
    let msg = error.message;
    try {
      const parsed = typeof ctx?.body === "string" ? JSON.parse(ctx.body) : ctx?.body;
      if (parsed && typeof parsed === "object" && "error" in parsed) msg = String((parsed as { error: unknown }).error);
    } catch {
      /* keep error.message */
    }
    throw new Error(msg);
  }
  if (data && typeof data === "object" && "error" in data) throw new Error(String((data as { error: unknown }).error));
  return data as T;
}

export const createAgency = createAsyncThunk(
  "agency/create",
  async (payload: { name: string; counselling_enabled?: boolean }, { rejectWithValue }) => {
    try {
      return await invokeOrThrow<{ agency: Agency }>("create-agency", payload);
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : "Couldn't create the agency");
    }
  },
);

export const inviteAgencyMember = createAsyncThunk(
  "agency/inviteMember",
  async (
    payload: {
      email: string;
      role: "manager" | "counsellor";
      employment_type: "employee" | "freelance";
      message?: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await invokeOrThrow<{ ok: true }>("invite-agency-member", payload);
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : "Couldn't send the invitation");
    }
  },
);

export const setAgencyMember = createAsyncThunk(
  "agency/setMember",
  async (
    payload: {
      member_user_id: string;
      role?: "manager" | "counsellor";
      counselling_enabled?: boolean;
      status?: "active" | "disabled";
    },
    { rejectWithValue },
  ) => {
    try {
      await invokeOrThrow("set-agency-member", payload);
      return payload;
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : "Couldn't update the member");
    }
  },
);

export const removeAgencyMember = createAsyncThunk(
  "agency/removeMember",
  async (payload: { member_user_id: string; reassign_to?: string }, { rejectWithValue }) => {
    try {
      await invokeOrThrow("remove-agency-member", payload);
      return payload.member_user_id;
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : "Couldn't remove the member");
    }
  },
);

export const assignClient = createAsyncThunk(
  "agency/assignClient",
  async (
    payload: {
      stub_id: string;
      to_admin_id: string;
      rate_pence: number | null;
      availability_note: string | null;
      intake_note: string | null;
    },
    { rejectWithValue },
  ) => {
    try {
      return await invokeOrThrow<{ ok: true; assignment_id: string }>("assign-client", payload);
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : "Couldn't assign the client");
    }
  },
);

export const respondToAssignment = createAsyncThunk(
  "agency/respondToAssignment",
  async (payload: { assignment_id: string; accept: boolean; decline_reason?: string }, { rejectWithValue }) => {
    try {
      await invokeOrThrow("respond-to-assignment", payload);
      return payload.assignment_id;
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : "Couldn't record your response");
    }
  },
);

// ── Writes: direct table (RLS-gated to managers) ───────────────────────────

export const createIntakeClient = createAsyncThunk(
  "agency/createIntakeClient",
  async (
    payload: {
      agency_id: string;
      first_name: string;
      last_name: string;
      email?: string | null;
      default_rate_pence?: number | null;
      availability_note?: string | null;
    },
    { rejectWithValue },
  ) => {
    const { data, error } = await supabase.from("client_stubs").insert(payload).select().single();
    if (error) return rejectWithValue(error.message);
    return { ...(data as Omit<AgencyClient, "assignment">), assignment: null } as AgencyClient;
  },
);

export const updateAgencyPolicies = createAsyncThunk(
  "agency/updatePolicies",
  async (
    {
      id,
      ...patch
    }: { id: string } & Partial<
      Pick<
        Agency,
        | "name"
        | "logo_url"
        | "locked_consent"
        | "consent_text"
        | "consent_pdf_url"
        | "shared_resources"
        | "require_note_encryption"
        | "locked_email_templates"
      >
    >,
    { rejectWithValue },
  ) => {
    const { data, error } = await supabase.from("agencies").update(patch).eq("id", id).select().single();
    if (error) return rejectWithValue(error.message);
    return data as Agency;
  },
);

export const addAgencyExpense = createAsyncThunk(
  "agency/addExpense",
  async (
    payload: Pick<AgencyExpense, "agency_id" | "incurred_on" | "amount_pence"> & {
      category?: string | null;
      note?: string | null;
    },
    { rejectWithValue },
  ) => {
    const { data, error } = await supabase.from("agency_expenses").insert(payload).select().single();
    if (error) return rejectWithValue(error.message);
    return data as AgencyExpense;
  },
);

export const deleteAgencyExpense = createAsyncThunk("agency/deleteExpense", async (id: string, { rejectWithValue }) => {
  const { error } = await supabase.from("agency_expenses").delete().eq("id", id);
  if (error) return rejectWithValue(error.message);
  return id;
});

export const saveOnboardingItem = createAsyncThunk(
  "agency/saveOnboardingItem",
  async (
    payload: {
      id?: string;
      agency_id: string;
      audience: "client" | "admin";
      title: string;
      body?: string | null;
      url?: string | null;
      sort_order?: number;
    },
    { rejectWithValue },
  ) => {
    const query = payload.id
      ? supabase.from("agency_onboarding_items").update(payload).eq("id", payload.id)
      : supabase.from("agency_onboarding_items").insert(payload);
    const { data, error } = await query.select().single();
    if (error) return rejectWithValue(error.message);
    return data as AgencyOnboardingItem;
  },
);

export const deleteOnboardingItem = createAsyncThunk(
  "agency/deleteOnboardingItem",
  async (id: string, { rejectWithValue }) => {
    const { error } = await supabase.from("agency_onboarding_items").delete().eq("id", id);
    if (error) return rejectWithValue(error.message);
    return id;
  },
);

// ── Slice ──────────────────────────────────────────────────────────────────

const agencySlice = createSlice({
  name: "agency",
  initialState,
  reducers: {
    clearAgencyError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(bootstrapAgency.pending, (state) => {
        state.bootstrapStatus = "loading";
      })
      .addCase(bootstrapAgency.fulfilled, (state, action) => {
        state.bootstrapStatus = "succeeded";
        state.membership = action.payload.membership;
        state.agency = action.payload.agency;
      })
      .addCase(bootstrapAgency.rejected, (state, action) => {
        state.bootstrapStatus = "failed";
        state.error = action.payload as string;
      })

      .addCase(fetchAgencyMembers.pending, (state) => {
        state.membersStatus = "loading";
      })
      .addCase(fetchAgencyMembers.fulfilled, (state, action) => {
        state.membersStatus = "succeeded";
        state.members = action.payload;
      })
      .addCase(fetchAgencyMembers.rejected, (state, action) => {
        state.membersStatus = "failed";
        state.error = action.payload as string;
      })

      .addCase(fetchAgencyClients.pending, (state) => {
        state.clientsStatus = "loading";
      })
      .addCase(fetchAgencyClients.fulfilled, (state, action) => {
        state.clientsStatus = "succeeded";
        state.clients = action.payload;
      })
      .addCase(fetchAgencyClients.rejected, (state, action) => {
        state.clientsStatus = "failed";
        state.error = action.payload as string;
      })

      .addCase(fetchIncomingAssignments.pending, (state) => {
        state.incomingStatus = "loading";
      })
      .addCase(fetchIncomingAssignments.fulfilled, (state, action) => {
        state.incomingStatus = "succeeded";
        state.incoming = action.payload;
      })
      .addCase(fetchIncomingAssignments.rejected, (state, action) => {
        state.incomingStatus = "failed";
        state.error = action.payload as string;
      })

      .addCase(fetchAgencyExpenses.fulfilled, (state, action) => {
        state.expenses = action.payload;
      })
      .addCase(addAgencyExpense.fulfilled, (state, action) => {
        state.expenses.unshift(action.payload);
      })
      .addCase(deleteAgencyExpense.fulfilled, (state, action) => {
        state.expenses = state.expenses.filter((e) => e.id !== action.payload);
      })

      .addCase(fetchOnboardingItems.fulfilled, (state, action) => {
        state.onboardingItems = action.payload;
      })
      .addCase(saveOnboardingItem.fulfilled, (state, action) => {
        const idx = state.onboardingItems.findIndex((i) => i.id === action.payload.id);
        if (idx === -1) state.onboardingItems.push(action.payload);
        else state.onboardingItems[idx] = action.payload;
      })
      .addCase(deleteOnboardingItem.fulfilled, (state, action) => {
        state.onboardingItems = state.onboardingItems.filter((i) => i.id !== action.payload);
      })

      .addCase(createAgency.fulfilled, (state, action) => {
        state.agency = action.payload.agency;
      })
      .addCase(updateAgencyPolicies.fulfilled, (state, action) => {
        state.agency = action.payload;
      })

      .addCase(createIntakeClient.fulfilled, (state, action) => {
        state.clients.unshift(action.payload);
      })

      .addCase(setAgencyMember.fulfilled, (state, action) => {
        const m = state.members.find((x) => x.user_id === action.payload.member_user_id);
        if (m) {
          if (action.payload.role) m.role = action.payload.role;
          if (typeof action.payload.counselling_enabled === "boolean")
            m.counselling_enabled = action.payload.counselling_enabled;
          if (action.payload.status) m.status = action.payload.status;
        }
      })
      .addCase(removeAgencyMember.fulfilled, (state, action) => {
        state.members = state.members.filter((m) => m.user_id !== action.payload);
      })
      .addCase(respondToAssignment.fulfilled, (state, action) => {
        state.incoming = state.incoming.filter((a) => a.id !== action.payload);
      })

      .addCase("RESET_ALL", () => initialState)

      // Matchers run after every addCase — keep this last.
      .addMatcher(
        (a): a is { type: string; payload: string } => a.type.startsWith("agency/") && a.type.endsWith("/rejected"),
        (state, action) => {
          if (typeof action.payload === "string") state.error = action.payload;
        },
      );
  },
});

export const { clearAgencyError } = agencySlice.actions;

type WithAgency = { agency: AgencyState };
export const selectAgencyMembership = (s: WithAgency) => s.agency.membership;
export const selectAgency = (s: WithAgency) => s.agency.agency;
export const selectAgencyBootstrapStatus = (s: WithAgency) => s.agency.bootstrapStatus;
export const selectIsAgencyManager = (s: WithAgency) =>
  s.agency.membership?.role === "manager" && s.agency.membership.status === "active";
export const selectIsAgencyMember = (s: WithAgency) => s.agency.membership?.status === "active";
export const selectAgencyMembers = (s: WithAgency) => s.agency.members;
export const selectAgencyClients = (s: WithAgency) => s.agency.clients;
export const selectIncomingAssignments = (s: WithAgency) => s.agency.incoming;
export const selectAgencyExpenses = (s: WithAgency) => s.agency.expenses;
export const selectOnboardingItems = (s: WithAgency) => s.agency.onboardingItems;
export const selectAgencyError = (s: WithAgency) => s.agency.error;

export default agencySlice.reducer;
