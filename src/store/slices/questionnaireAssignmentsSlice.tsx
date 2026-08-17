// ============================================================
// QUESTIONNAIRE ASSIGNMENTS SLICE
// Manages which questionnaires are assigned to which clients
// ============================================================

import { createAsyncThunk, createSelector, createSlice } from "@reduxjs/toolkit";

import { supabase } from "../../lib/supabase.js";

type Assignment = {
  id: string;
  questionnaire_id: string | null;
  user_id: string | null;
  stub_id: string | null;
  assigned_at: string | null;
  is_plotted: boolean;
  questionnaires?: { title: string } | null;
  users?: { first_name: string; last_name: string } | null;
};

type AssignmentsState = {
  assignments: Assignment[];
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
};

const initialState: AssignmentsState = {
  assignments: [],
  status: "idle",
  error: null,
};

// ─── Thunks ────────────────────────────────────────────────

// Admin: fetch all assignments (with joined questionnaire + user data)
export const fetchAllAssignments = createAsyncThunk<Assignment[]>(
  "assignments/fetchAllAssignments",
  async (_, { rejectWithValue }) => {
    const { data, error } = await supabase
      .from("questionnaire_assignments")
      .select("*, questionnaires(title), users(first_name, last_name)")
      .order("assigned_at", { ascending: false });

    if (error) return rejectWithValue(error.message);
    return data;
  },
);

// Fetch all assignments for a specific client
export const fetchAssignmentsByUser = createAsyncThunk<Assignment[], string>(
  "assignments/fetchAssignmentsByUser",
  async (userId, { rejectWithValue }) => {
    const { data, error } = await supabase
      .from("questionnaire_assignments")
      .select(`
        *,
        questionnaires (
          *,
          questions (*)
        )
      `)
      .eq("user_id", userId)
      .order("assigned_at", { ascending: false });

    if (error) return rejectWithValue(error.message);

    return data ?? [];
  },
);

// Fetch all assignments for a specific questionnaire (who has it assigned)
export const fetchAssignmentsByQuestionnaire = createAsyncThunk<Assignment[], string>(
  "assignments/fetchAssignmentsByQuestionnaire",
  async (questionnaireId, { rejectWithValue }) => {
    const { data, error } = await supabase
      .from("questionnaire_assignments")
      .select("*, users(first_name, last_name)")
      .eq("questionnaire_id", questionnaireId)
      .order("assigned_at", { ascending: false });

    if (error) return rejectWithValue(error.message);
    return data;
  },
);

// Assign a questionnaire to a client
export const assignQuestionnaire = createAsyncThunk<Assignment, { questionnaire_id: string; user_id: string }>(
  "assignments/assignQuestionnaire",
  async (payload, { rejectWithValue }) => {
    const { data, error } = await supabase
      .from("questionnaire_assignments")
      .insert({ ...payload, assigned_at: new Date().toISOString() })
      .select()
      .single();

    if (error) return rejectWithValue(error.message);
    return data;
  },
);

// Unassign a questionnaire from a client
export const unassignQuestionnaire = createAsyncThunk<string, string>(
  "assignments/unassignQuestionnaire",
  async (id, { rejectWithValue }) => {
    const { error } = await supabase.from("questionnaire_assignments").delete().eq("id", id);

    if (error) return rejectWithValue(error.message);
    return id;
  },
);

// Unassign by user + questionnaire (useful when you don't have the assignment id)
export const unassignQuestionnaireByIds = createAsyncThunk<
  { questionnaire_id: string; user_id: string },
  { questionnaire_id: string; user_id: string }
>("assignments/unassignQuestionnaireByIds", async ({ questionnaire_id, user_id }, { rejectWithValue }) => {
  const { error } = await supabase
    .from("questionnaire_assignments")
    .delete()
    .eq("questionnaire_id", questionnaire_id)
    .eq("user_id", user_id);

  if (error) return rejectWithValue(error.message);
  return { questionnaire_id, user_id };
});

// Toggle is_plotted for a client's assignment — at most one can be plotted at a time
export const setPlottedAssignment = createAsyncThunk<string, string>(
  "assignments/setPlottedAssignment",
  async (assignmentId, { rejectWithValue }) => {
    const { error } = await supabase.rpc("set_plotted_assignment", {
      p_assignment_id: assignmentId,
    });
    if (error) return rejectWithValue(error.message);
    return assignmentId;
  },
);

// ─── Slice ─────────────────────────────────────────────────

const assignmentsSlice = createSlice({
  name: "assignments",
  initialState,
  reducers: {
    clearAssignmentError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAllAssignments.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchAllAssignments.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.assignments = action.payload;
      })
      .addCase(fetchAllAssignments.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload as string;
      })

      .addCase(fetchAssignmentsByUser.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchAssignmentsByUser.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.assignments = action.payload;
      })
      .addCase(fetchAssignmentsByUser.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload as string;
      })

      .addCase(fetchAssignmentsByQuestionnaire.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.assignments = action.payload;
      })
      .addCase(fetchAssignmentsByQuestionnaire.rejected, (state, action) => {
        state.error = action.payload as string;
      })

      .addCase(assignQuestionnaire.fulfilled, (state, action) => {
        state.assignments.unshift(action.payload);
      })
      .addCase(assignQuestionnaire.rejected, (state, action) => {
        state.error = action.payload as string;
      })

      .addCase(unassignQuestionnaire.fulfilled, (state, action) => {
        state.assignments = state.assignments.filter((a) => a.id !== action.payload);
      })
      .addCase(unassignQuestionnaire.rejected, (state, action) => {
        state.error = action.payload as string;
      })

      .addCase(unassignQuestionnaireByIds.fulfilled, (state, action) => {
        state.assignments = state.assignments.filter(
          (a) => !(a.questionnaire_id === action.payload.questionnaire_id && a.user_id === action.payload.user_id),
        );
      })
      .addCase(unassignQuestionnaireByIds.rejected, (state, action) => {
        state.error = action.payload as string;
      })

      .addCase(setPlottedAssignment.fulfilled, (state, action) => {
        const target = state.assignments.find((a) => a.id === action.payload);
        if (!target) return;
        const wasPlotted = target.is_plotted;
        const userId = target.user_id;
        const stubId = target.stub_id;
        state.assignments = state.assignments.map((a) => {
          if ((userId && a.user_id === userId) || (stubId && a.stub_id === stubId)) {
            return { ...a, is_plotted: false };
          }
          return a;
        });
        if (!wasPlotted) {
          state.assignments = state.assignments.map((a) => (a.id === action.payload ? { ...a, is_plotted: true } : a));
        }
      })
      .addCase(setPlottedAssignment.rejected, (state, action) => {
        state.error = action.payload as string;
      })

      .addCase("RESET_ALL", () => initialState);
  },
});

export const { clearAssignmentError } = assignmentsSlice.actions;

// ─── Selectors ─────────────────────────────────────────────

type RootState = { assignments: AssignmentsState };

export const selectAllAssignments = (state: RootState) => state.assignments.assignments;
export const selectAssignmentsStatus = (state: RootState) => state.assignments.status;

// Get all assignments for a specific user
export const selectAssignmentsByUser = (userId: string) =>
  createSelector(selectAllAssignments, (assignments) => assignments.filter((a) => a.user_id === userId));

// Get all users assigned to a specific questionnaire
export const selectAssignmentsByQuestionnaire = (questionnaireId: string) =>
  createSelector(selectAllAssignments, (assignments) =>
    assignments.filter((a) => a.questionnaire_id === questionnaireId),
  );

// Check if a specific questionnaire is assigned to a specific user
export const selectIsAssigned = (userId: string, questionnaireId: string) =>
  createSelector(selectAllAssignments, (assignments) =>
    assignments.some((a) => a.user_id === userId && a.questionnaire_id === questionnaireId),
  );

// The single plotted assignment for a real client (null if none set)
export const selectPlottedAssignmentByUser = (userId: string) =>
  createSelector(
    selectAllAssignments,
    (assignments) => assignments.find((a) => a.user_id === userId && a.is_plotted) ?? null,
  );

// The single plotted assignment for an offline client stub
export const selectPlottedAssignmentByStub = (stubId: string) =>
  createSelector(
    selectAllAssignments,
    (assignments) => assignments.find((a) => a.stub_id === stubId && a.is_plotted) ?? null,
  );

export default assignmentsSlice.reducer;
