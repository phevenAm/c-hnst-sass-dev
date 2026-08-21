import { createAsyncThunk, createSelector, createSlice } from "@reduxjs/toolkit";

import { supabase } from "../../lib/supabase.js";
import type { Questionnaire, UpdateQuestionnaire } from "../../models/globalTypes.js";

type QuestionnairesState = {
  questionnaires: Questionnaire[];
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
};

const initialState: QuestionnairesState = {
  questionnaires: [],
  status: "idle",
  error: null,
};

export const fetchQuestionnaires = createAsyncThunk<Questionnaire[], void>(
  "questionnaires/fetchQuestionnaires",
  async (_, { rejectWithValue }) => {
    const { data, error } = await supabase.from("questionnaires").select(`
      *,
      questions (*, tag:tags (id, name)),
      questionnaire_assignments (user_id)
    `);
    if (error) return rejectWithValue(error.message);

    // Map questionnaire_assignments into assignedTo string[]
    // biome-ignore lint/suspicious/noExplicitAny: Supabase joined query result shape isn't typed by the client
    return data.map((q: any) => ({
      ...q,
      // biome-ignore lint/suspicious/noExplicitAny: Supabase joined query result shape isn't typed by the client
      assignedTo: (q.questionnaire_assignments ?? []).map((a: any) => a.user_id),
    }));
  },
);

export const createQuestionnaire = createAsyncThunk<Questionnaire, Questionnaire>(
  "questionnaires/createQuestionnaire",
  async (data, { rejectWithValue }) => {
    // biome-ignore lint/suspicious/noExplicitAny: QuestionnaireFormData cast includes form_type
    const d = data as any;
    const formType = d.form_type ?? "outcome_measure";
    const { data: questionnaire, error: questionnaireError } = await supabase
      .from("questionnaires")
      .insert({
        title: data.title,
        description: data.description,
        frequency: formType === "outcome_measure" ? data.frequency : null,
        form_type: formType,
        pdf_url: d.pdf_url ?? null,
        is_active: true,
      })
      .select()
      .single();

    if (questionnaireError) return rejectWithValue(questionnaireError.message);

    const questionRows = data.questions.map((question, index) => ({
      questionnaire_id: questionnaire.id,
      text: question.text,
      type: question.type,
      tag_id: question.type === "scale" ? (question.tag_id ?? null) : null,
      min_value: question.type === "scale" ? (question.min_value ?? 1) : null,
      max_value: question.type === "scale" ? (question.max_value ?? 10) : null,
      min_label: question.type === "scale" ? (question.min_label ?? null) : null,
      max_label: question.type === "scale" ? (question.max_label ?? null) : null,
      // biome-ignore lint/suspicious/noExplicitAny: options shape comes from QuestionDraft
      options: question.type === "multiple_choice" ? ((question as any).options ?? null) : null,
      order_index: question.order_index ?? index + 1,
      is_required: question.is_required ?? true,
    }));

    const { data: questions, error: questionsError } = await supabase.from("questions").insert(questionRows).select();

    if (questionsError) return rejectWithValue(questionsError.message);

    return { ...questionnaire, questions, assignedTo: [] };
  },
);

export const updateQuestionnaire = createAsyncThunk<Questionnaire, UpdateQuestionnaire>(
  "questionnaires/updateQuestionnaire",
  async ({ id, ...fields }, { rejectWithValue }) => {
    const { data, error } = await supabase
      .from("questionnaires")
      .update(fields)
      .eq("id", id)
      .select("*, questions(*, tag:tags(id, name)), questionnaire_assignments(user_id)")
      .single();

    if (error) return rejectWithValue(error.message);
    return {
      ...data,
      // biome-ignore lint/suspicious/noExplicitAny: Supabase joined query result shape isn't typed by the client
      assignedTo: (data.questionnaire_assignments ?? []).map((a: any) => a.user_id),
    };
  },
);

export const updateQuestionTag = createAsyncThunk<
  { questionId: string; questionnaireId: string; tag_id: string | null; tag: { id: string; name: string } | null },
  { questionId: string; questionnaireId: string; tag_id: string | null; tag: { id: string; name: string } | null }
>("questionnaires/updateQuestionTag", async ({ questionId, questionnaireId, tag_id, tag }, { rejectWithValue }) => {
  const { error } = await supabase.from("questions").update({ tag_id }).eq("id", questionId);
  if (error) return rejectWithValue(error.message);
  return { questionId, questionnaireId, tag_id, tag };
});

export const deleteQuestionnaire = createAsyncThunk<string, string>(
  "questionnaires/deleteQuestionnaire",
  async (id, { rejectWithValue }) => {
    const { error } = await supabase.from("questionnaires").delete().eq("id", id);
    if (error) return rejectWithValue(error.message);
    return id;
  },
);

export const pauseQuestionnaire = createAsyncThunk<
  { id: string; is_active: boolean },
  { id: string; is_active: boolean }
>("questionnaires/pauseQuestionnaire", async ({ id, is_active }, { rejectWithValue }) => {
  const { error } = await supabase.from("questionnaires").update({ is_active }).eq("id", id);
  if (error) return rejectWithValue(error.message);
  return { id, is_active };
});

const questionnairesSlice = createSlice({
  name: "questionnaires",
  initialState,
  reducers: {
    clearQuestionnaireError: (state) => {
      state.error = null;
    },
    // Update assignedTo locally after assign/unassign so UI stays in sync
    addAssignment: (state, action: { payload: { questionnaire_id: string; user_id: string } }) => {
      const q = state.questionnaires.find((q) => q.id === action.payload.questionnaire_id);
      if (q && !q.assignedTo.includes(action.payload.user_id)) {
        q.assignedTo.push(action.payload.user_id);
      }
    },
    removeAssignment: (state, action: { payload: { questionnaire_id: string; user_id: string } }) => {
      const q = state.questionnaires.find((q) => q.id === action.payload.questionnaire_id);
      if (q) {
        q.assignedTo = q.assignedTo.filter((id) => id !== action.payload.user_id);
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchQuestionnaires.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchQuestionnaires.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.questionnaires = action.payload;
      })
      .addCase(fetchQuestionnaires.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload as string;
      })
      .addCase(createQuestionnaire.fulfilled, (state, action) => {
        state.questionnaires.unshift(action.payload);
      })
      .addCase(createQuestionnaire.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(updateQuestionnaire.fulfilled, (state, action) => {
        const index = state.questionnaires.findIndex((q) => q.id === action.payload.id);
        if (index !== -1) state.questionnaires[index] = action.payload;
      })
      .addCase(updateQuestionnaire.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(deleteQuestionnaire.fulfilled, (state, action) => {
        state.questionnaires = state.questionnaires.filter((q) => q.id !== action.payload);
      })
      .addCase(deleteQuestionnaire.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(pauseQuestionnaire.fulfilled, (state, action) => {
        const q = state.questionnaires.find((q) => q.id === action.payload.id);
        if (q) q.is_active = action.payload.is_active;
      })
      .addCase(pauseQuestionnaire.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(updateQuestionTag.fulfilled, (state, action) => {
        const questionnaire = state.questionnaires.find((q) => q.id === action.payload.questionnaireId);
        if (!questionnaire) return;
        const question = questionnaire.questions?.find((q) => q.id === action.payload.questionId);
        if (!question) return;
        question.tag_id = action.payload.tag_id;
        question.tag = action.payload.tag ?? undefined;
      })
      .addCase(updateQuestionTag.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase("RESET_ALL", () => initialState);
  },
});

export const { clearQuestionnaireError, addAssignment, removeAssignment } = questionnairesSlice.actions;

type RootState = { questionnaires: QuestionnairesState };

export const selectAllQuestionnaires = (state: RootState) => state.questionnaires.questionnaires;
export const selectQuestionnairesStatus = (state: RootState) => state.questionnaires.status;

export const selectActiveQuestionnaires = createSelector(selectAllQuestionnaires, (questionnaires) =>
  questionnaires.filter((q) => q.is_active),
);

export const selectQuestionnaireById = (id: string) =>
  createSelector(selectAllQuestionnaires, (questionnaires) => questionnaires.find((q) => q.id === id));

export const selectQuestionnairesByFrequency = (frequency: string) =>
  createSelector(selectAllQuestionnaires, (questionnaires) => questionnaires.filter((q) => q.frequency === frequency));

export default questionnairesSlice.reducer;
