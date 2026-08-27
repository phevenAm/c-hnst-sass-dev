// ============================================================
// RESOURCES SLICE — articles, videos, and other content
// ============================================================

import { createAsyncThunk, createSelector, createSlice } from "@reduxjs/toolkit";

import { supabase } from "../../lib/supabase.js";
import type { Resource, UpdateResource } from "../../models/globalTypes.js";

type ResourcesState = {
  resources: Resource[];
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
};

const initialState: ResourcesState = {
  resources: [],
  status: "idle",
  error: null,
};

// ─── Thunks ────────────────────────────────────────────────

// Admin: fetch all resources (published + unpublished)
export const fetchResources = createAsyncThunk<Resource[]>(
  "resources/fetchResources",
  async (_, { rejectWithValue }) => {
    const { data, error } = await supabase.from("resources").select("*").order("created_at", { ascending: false });
    if (error) return rejectWithValue(error.message);
    return data;
  },
);

// Client: fetch only published resources
export const fetchPublishedResources = createAsyncThunk<Resource[]>(
  "resources/fetchPublishedResources",
  async (_, { rejectWithValue }) => {
    const { data, error } = await supabase
      .from("resources")
      .select("*")
      .eq("is_published", true)
      .order("updated_at", { ascending: false });
    if (error) return rejectWithValue(error.message);
    return data;
  },
);

export const createResource = createAsyncThunk<Resource, Omit<Resource, "id" | "created_at" | "updated_at">>(
  "resources/createResource",
  async (payload, { rejectWithValue }) => {
    const { data, error } = await supabase
      .from("resources")
      .insert({ ...payload })
      .select()
      .single();
    if (error) return rejectWithValue(error.message);
    return data;
  },
);

export const updateResource = createAsyncThunk<Resource, UpdateResource>(
  "resources/updateResource",
  async ({ id, ...fields }, { rejectWithValue }) => {
    const { data, error } = await supabase
      .from("resources")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) return rejectWithValue(error.message);
    return data;
  },
);

export const deleteResource = createAsyncThunk<string, string>(
  "resources/deleteResource",
  async (id, { rejectWithValue }) => {
    const { error } = await supabase.from("resources").delete().eq("id", id);
    if (error) return rejectWithValue(error.message);
    return id;
  },
);

export const togglePublished = createAsyncThunk<
  { id: string; is_published: boolean },
  { id: string; is_published: boolean }
>("resources/togglePublished", async ({ id, is_published }, { rejectWithValue }) => {
  const newValue = is_published;
  const { error } = await supabase
    .from("resources")
    .update({ is_published: newValue, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return rejectWithValue(error.message);
  return { id, is_published: newValue };
});

// Pinned resources sort first within their tab, on both the admin and client
// Resources pages.
export const togglePinned = createAsyncThunk<{ id: string; is_pinned: boolean }, { id: string; is_pinned: boolean }>(
  "resources/togglePinned",
  async ({ id, is_pinned }, { rejectWithValue }) => {
    const { error } = await supabase
      .from("resources")
      .update({ is_pinned, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return rejectWithValue(error.message);
    return { id, is_pinned };
  },
);

// ─── Slice ─────────────────────────────────────────────────

const resourcesSlice = createSlice({
  name: "resources",
  initialState,
  reducers: {
    clearResourceError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchResources.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchResources.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.resources = action.payload;
      })
      .addCase(fetchResources.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload as string;
      })
      .addCase(fetchPublishedResources.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchPublishedResources.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.resources = action.payload;
      })
      .addCase(fetchPublishedResources.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload as string;
      })
      .addCase(createResource.fulfilled, (state, action) => {
        state.resources.unshift(action.payload);
      })
      .addCase(createResource.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(updateResource.fulfilled, (state, action) => {
        const index = state.resources.findIndex((r) => r.id === action.payload.id);
        if (index !== -1) state.resources[index] = action.payload;
      })
      .addCase(updateResource.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(deleteResource.fulfilled, (state, action) => {
        state.resources = state.resources.filter((r) => r.id !== action.payload);
      })
      .addCase(deleteResource.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(togglePublished.fulfilled, (state, action) => {
        const r = state.resources.find((r) => r.id === action.payload.id);
        if (r) r.is_published = action.payload.is_published;
      })
      .addCase(togglePublished.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(togglePinned.fulfilled, (state, action) => {
        const r = state.resources.find((r) => r.id === action.payload.id);
        if (r) r.is_pinned = action.payload.is_pinned;
      })
      .addCase(togglePinned.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase("RESET_ALL", () => initialState);
  },
});

export const { clearResourceError } = resourcesSlice.actions;

// ─── Selectors ─────────────────────────────────────────────

type RootState = { resources: ResourcesState };

export const selectAllResources = (state: RootState) => state.resources.resources;
export const selectResourcesStatus = (state: RootState) => state.resources.status;
export const selectResourcesError = (state: RootState) => state.resources.error;

export const selectPublishedResources = createSelector(selectAllResources, (resources) =>
  resources.filter((r) => r.is_published),
);

export const selectResourcesByType = (type: string) =>
  createSelector(selectAllResources, (resources) => resources.filter((r) => r.type === type && r.is_published));

export const selectResourceById = (id: string) =>
  createSelector(selectAllResources, (resources) => resources.find((r) => r.id === id));

export default resourcesSlice.reducer;
