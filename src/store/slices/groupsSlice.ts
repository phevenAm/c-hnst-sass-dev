import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import { getErrorMessage } from "@/Helpers/Helpers";
import { supabase } from "../../lib/supabase.js";
import type { Group, GroupMember, GroupStaffRow } from "../../models/agency";

type Status = "idle" | "loading" | "succeeded" | "failed";

// A group with its member/staff rows attached — what the UI actually renders.
// Display names are resolved client-side against agencySlice's already-loaded
// clients/members lists rather than duplicating a join here.
export type GroupWithRows = Group & { members: GroupMember[]; staff: GroupStaffRow[] };

type GroupsState = {
  groups: GroupWithRows[];
  status: Status;
  error: string | null;
};

const initialState: GroupsState = {
  groups: [],
  status: "idle",
  error: null,
};

export const fetchGroups = createAsyncThunk("groups/fetch", async (agencyId: string, { rejectWithValue }) => {
  const [{ data: groups, error: gErr }, { data: members, error: mErr }, { data: staff, error: stErr }] =
    await Promise.all([
      supabase.from("groups").select("*").eq("agency_id", agencyId).order("created_at", { ascending: false }),
      supabase.from("group_members").select("*"),
      supabase.from("group_staff").select("*"),
    ]);
  if (gErr) return rejectWithValue(gErr.message);
  if (mErr) return rejectWithValue(mErr.message);
  if (stErr) return rejectWithValue(stErr.message);

  const membersByGroup = new Map<string, GroupMember[]>();
  for (const m of (members ?? []) as GroupMember[]) {
    const list = membersByGroup.get(m.group_id) ?? [];
    list.push(m);
    membersByGroup.set(m.group_id, list);
  }
  const staffByGroup = new Map<string, GroupStaffRow[]>();
  for (const s of (staff ?? []) as GroupStaffRow[]) {
    const list = staffByGroup.get(s.group_id) ?? [];
    list.push(s);
    staffByGroup.set(s.group_id, list);
  }

  return ((groups ?? []) as Group[]).map((g) => ({
    ...g,
    members: membersByGroup.get(g.id) ?? [],
    staff: staffByGroup.get(g.id) ?? [],
  }));
});

export const createGroup = createAsyncThunk(
  "groups/create",
  async (payload: { agency_id: string; name: string; description: string | null }, { rejectWithValue }) => {
    const { data, error } = await supabase.from("groups").insert(payload).select().single();
    if (error) return rejectWithValue(error.message);
    return { ...(data as Group), members: [] as GroupMember[], staff: [] as GroupStaffRow[] };
  },
);

export const deleteGroup = createAsyncThunk("groups/delete", async (groupId: string, { rejectWithValue }) => {
  const { error } = await supabase.from("groups").delete().eq("id", groupId);
  if (error) return rejectWithValue(error.message);
  return groupId;
});

export const addGroupMember = createAsyncThunk(
  "groups/addMember",
  async (payload: { group_id: string; stub_id: string }, { rejectWithValue }) => {
    const { data, error } = await supabase.from("group_members").insert(payload).select().single();
    if (error) return rejectWithValue(error.message);
    return data as GroupMember;
  },
);

export const removeGroupMember = createAsyncThunk(
  "groups/removeMember",
  async (payload: { id: string; group_id: string }, { rejectWithValue }) => {
    const { error } = await supabase.from("group_members").delete().eq("id", payload.id);
    if (error) return rejectWithValue(error.message);
    return payload;
  },
);

export const addGroupStaff = createAsyncThunk(
  "groups/addStaff",
  async (payload: { group_id: string; user_id: string; group_name: string }, { rejectWithValue }) => {
    const { group_name, ...insertPayload } = payload;
    const { data, error } = await supabase.from("group_staff").insert(insertPayload).select().single();
    if (error) return rejectWithValue(error.message);
    // Best-effort — a staff member should hear about this, but a failed
    // notification insert shouldn't undo the (already-succeeded) assignment.
    // RLS ("admins can insert notifications") lets any admin insert for any
    // user_id, so this can go straight from the frontend — no edge function
    // needed, unlike assign-client (which also emails, since that crosses
    // from "pool" to "your caseload"; this is a lighter internal ping).
    try {
      await supabase.from("notifications").insert({
        user_id: payload.user_id,
        type: "group_assignment",
        message: `You've been added to the group "${group_name}"`,
        url: "/agency/groups",
      });
    } catch {
      /* swallow — see comment above */
    }
    return data as GroupStaffRow;
  },
);

export const removeGroupStaff = createAsyncThunk(
  "groups/removeStaff",
  async (payload: { id: string; group_id: string }, { rejectWithValue }) => {
    const { error } = await supabase.from("group_staff").delete().eq("id", payload.id);
    if (error) return rejectWithValue(error.message);
    return payload;
  },
);

const groupsSlice = createSlice({
  name: "groups",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchGroups.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchGroups.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.groups = action.payload;
      })
      .addCase(fetchGroups.rejected, (state, action) => {
        state.status = "failed";
        state.error = getErrorMessage(action.payload, "Couldn't load groups");
      })
      .addCase(createGroup.fulfilled, (state, action) => {
        state.groups.unshift(action.payload);
      })
      .addCase(deleteGroup.fulfilled, (state, action) => {
        state.groups = state.groups.filter((g) => g.id !== action.payload);
      })
      .addCase(addGroupMember.fulfilled, (state, action) => {
        const group = state.groups.find((g) => g.id === action.payload.group_id);
        if (group) group.members.push(action.payload);
      })
      .addCase(removeGroupMember.fulfilled, (state, action) => {
        const group = state.groups.find((g) => g.id === action.payload.group_id);
        if (group) group.members = group.members.filter((m) => m.id !== action.payload.id);
      })
      .addCase(addGroupStaff.fulfilled, (state, action) => {
        const group = state.groups.find((g) => g.id === action.payload.group_id);
        if (group) group.staff.push(action.payload);
      })
      .addCase(removeGroupStaff.fulfilled, (state, action) => {
        const group = state.groups.find((g) => g.id === action.payload.group_id);
        if (group) group.staff = group.staff.filter((s) => s.id !== action.payload.id);
      });
  },
});

type WithGroups = { groups: GroupsState };
export const selectGroups = (s: WithGroups) => s.groups.groups;
export const selectGroupsStatus = (s: WithGroups) => s.groups.status;
export const selectGroupsForStub = (stubId: string) => (s: WithGroups) =>
  s.groups.groups.filter((g) => g.members.some((m) => m.stub_id === stubId));

export default groupsSlice.reducer;
