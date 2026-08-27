// ============================================================
// PRACTICE DOCUMENTS SLICE — PDF housekeeping material an admin
// shares with clients (working agreement, house rules, privacy
// notice…). One document may be flagged `requires_signature`,
// which drives the existing client-consent gate.
// ============================================================

import { createAsyncThunk, createSelector, createSlice } from "@reduxjs/toolkit";

import { supabase } from "../../lib/supabase.js";
import type { DocumentSignature, PracticeDocument, UpdatePracticeDocument } from "../../models/globalTypes.js";

type PracticeDocumentsState = {
  documents: PracticeDocument[];
  mySignatures: DocumentSignature[];
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
};

const initialState: PracticeDocumentsState = {
  documents: [],
  mySignatures: [],
  status: "idle",
  error: null,
};

// ─── Thunks ────────────────────────────────────────────────

// RLS scopes this: admins get every row they own, clients get only the
// active documents belonging to their own admin.
export const fetchPracticeDocuments = createAsyncThunk<PracticeDocument[]>(
  "practiceDocuments/fetch",
  async (_, { rejectWithValue }) => {
    const { data, error } = await supabase
      .from("practice_documents")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) return rejectWithValue(error.message);
    return data;
  },
);

// Client: the signatures this user has made (RLS returns own rows only).
export const fetchMyDocumentSignatures = createAsyncThunk<DocumentSignature[]>(
  "practiceDocuments/fetchMySignatures",
  async (_, { rejectWithValue }) => {
    const { data, error } = await supabase.from("document_signatures").select("*");
    if (error) return rejectWithValue(error.message);
    return data;
  },
);

export const createPracticeDocument = createAsyncThunk<
  PracticeDocument,
  { title: string; description?: string | null; pdf_url?: string | null; sort_order?: number }
>("practiceDocuments/create", async (payload, { rejectWithValue }) => {
  // admin_id defaults to auth.uid() server-side.
  const { data, error } = await supabase.from("practice_documents").insert(payload).select().single();
  if (error) return rejectWithValue(error.message);
  return data;
});

export const updatePracticeDocument = createAsyncThunk<PracticeDocument, UpdatePracticeDocument>(
  "practiceDocuments/update",
  async ({ id, ...fields }, { rejectWithValue }) => {
    const { data, error } = await supabase
      .from("practice_documents")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) return rejectWithValue(error.message);
    return data;
  },
);

export const deletePracticeDocument = createAsyncThunk<string, string>(
  "practiceDocuments/delete",
  async (id, { rejectWithValue }) => {
    const { error } = await supabase.from("practice_documents").delete().eq("id", id);
    if (error) return rejectWithValue(error.message);
    return id;
  },
);

// Persist a new order. Caller passes the full list in its desired order;
// we write each row's new sort_order.
export const reorderPracticeDocuments = createAsyncThunk<{ id: string; sort_order: number }[], string[]>(
  "practiceDocuments/reorder",
  async (orderedIds, { rejectWithValue }) => {
    const updates = orderedIds.map((id, i) => ({ id, sort_order: i }));
    for (const u of updates) {
      const { error } = await supabase
        .from("practice_documents")
        .update({ sort_order: u.sort_order, updated_at: new Date().toISOString() })
        .eq("id", u.id);
      if (error) return rejectWithValue(error.message);
    }
    return updates;
  },
);

// Flip which document requires a signature (at most one per practice —
// backed by a partial unique index, so clear the old one first) and keep
// practice_settings.consent_document_id in step so the consent gate reads
// the right document. Pass documentId = null to turn signing off.
export const setSignatureDocument = createAsyncThunk<string | null, { documentId: string | null; adminId: string }>(
  "practiceDocuments/setSignatureDocument",
  async ({ documentId, adminId }, { rejectWithValue }) => {
    const clear = await supabase
      .from("practice_documents")
      .update({ requires_signature: false, updated_at: new Date().toISOString() })
      .eq("admin_id", adminId)
      .eq("requires_signature", true);
    if (clear.error) return rejectWithValue(clear.error.message);

    if (documentId) {
      const set = await supabase
        .from("practice_documents")
        .update({ requires_signature: true, updated_at: new Date().toISOString() })
        .eq("id", documentId);
      if (set.error) return rejectWithValue(set.error.message);
    }

    const settings = await supabase
      .from("practice_settings")
      .update({ consent_document_id: documentId })
      .eq("admin_id", adminId);
    if (settings.error) return rejectWithValue(settings.error.message);

    return documentId;
  },
);

// ─── Slice ─────────────────────────────────────────────────

const practiceDocumentsSlice = createSlice({
  name: "practiceDocuments",
  initialState,
  reducers: {
    clearPracticeDocumentsError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPracticeDocuments.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchPracticeDocuments.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.documents = action.payload;
      })
      .addCase(fetchPracticeDocuments.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload as string;
      })
      .addCase(fetchMyDocumentSignatures.fulfilled, (state, action) => {
        state.mySignatures = action.payload;
      })
      .addCase(fetchMyDocumentSignatures.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(createPracticeDocument.fulfilled, (state, action) => {
        state.documents.push(action.payload);
      })
      .addCase(createPracticeDocument.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(updatePracticeDocument.fulfilled, (state, action) => {
        const i = state.documents.findIndex((d) => d.id === action.payload.id);
        if (i !== -1) state.documents[i] = action.payload;
      })
      .addCase(updatePracticeDocument.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(deletePracticeDocument.fulfilled, (state, action) => {
        state.documents = state.documents.filter((d) => d.id !== action.payload);
      })
      .addCase(deletePracticeDocument.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(reorderPracticeDocuments.fulfilled, (state, action) => {
        for (const { id, sort_order } of action.payload) {
          const d = state.documents.find((doc) => doc.id === id);
          if (d) d.sort_order = sort_order;
        }
        state.documents.sort((a, b) => a.sort_order - b.sort_order);
      })
      .addCase(reorderPracticeDocuments.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(setSignatureDocument.fulfilled, (state, action) => {
        for (const d of state.documents) d.requires_signature = d.id === action.payload;
      })
      .addCase(setSignatureDocument.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase("RESET_ALL", () => initialState);
  },
});

export const { clearPracticeDocumentsError } = practiceDocumentsSlice.actions;

// ─── Selectors ─────────────────────────────────────────────

type RootState = { practiceDocuments: PracticeDocumentsState };

export const selectPracticeDocuments = (state: RootState) => state.practiceDocuments.documents;
export const selectPracticeDocumentsStatus = (state: RootState) => state.practiceDocuments.status;
export const selectPracticeDocumentsError = (state: RootState) => state.practiceDocuments.error;
export const selectMyDocumentSignatures = (state: RootState) => state.practiceDocuments.mySignatures;

export const selectSignatureDocument = createSelector(selectPracticeDocuments, (docs) =>
  docs.find((d) => d.requires_signature),
);

export const selectMySignatureFor = (documentId: string | undefined) =>
  createSelector(selectMyDocumentSignatures, (sigs) =>
    documentId ? sigs.find((s) => s.document_id === documentId) : undefined,
  );

export default practiceDocumentsSlice.reducer;
