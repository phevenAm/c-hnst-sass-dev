// ============================================================
// RESOURCE FAVOURITES SLICE — a client's starred resources.
// Table + RLS ship in migration 20260817000003; this is the
// first frontend use.
// ============================================================

import { createAsyncThunk, createSelector, createSlice } from "@reduxjs/toolkit";

import { supabase } from "../../lib/supabase.js";

type ResourceFavouritesState = {
  ids: string[];
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
};

const initialState: ResourceFavouritesState = {
  ids: [],
  status: "idle",
  error: null,
};

// RLS scopes rows to the calling user, so no user_id filter needed on read.
export const fetchMyFavourites = createAsyncThunk<string[]>(
  "resourceFavourites/fetch",
  async (_, { rejectWithValue }) => {
    const { data, error } = await supabase.from("resource_favourites").select("resource_id");
    if (error) return rejectWithValue(error.message);
    return (data ?? []).map((r) => r.resource_id);
  },
);

export const toggleFavourite = createAsyncThunk<
  { resourceId: string; on: boolean },
  { resourceId: string; userId: string; on: boolean }
>("resourceFavourites/toggle", async ({ resourceId, userId, on }, { rejectWithValue }) => {
  if (on) {
    const { error } = await supabase.from("resource_favourites").insert({ user_id: userId, resource_id: resourceId });
    if (error) return rejectWithValue(error.message);
  } else {
    const { error } = await supabase
      .from("resource_favourites")
      .delete()
      .eq("user_id", userId)
      .eq("resource_id", resourceId);
    if (error) return rejectWithValue(error.message);
  }
  return { resourceId, on };
});

const resourceFavouritesSlice = createSlice({
  name: "resourceFavourites",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchMyFavourites.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchMyFavourites.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.ids = action.payload;
      })
      .addCase(fetchMyFavourites.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload as string;
      })
      // Optimistic-ish: only apply once the write succeeds.
      .addCase(toggleFavourite.fulfilled, (state, action) => {
        const { resourceId, on } = action.payload;
        if (on) {
          if (!state.ids.includes(resourceId)) state.ids.push(resourceId);
        } else {
          state.ids = state.ids.filter((id) => id !== resourceId);
        }
      })
      .addCase(toggleFavourite.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase("RESET_ALL", () => initialState);
  },
});

type RootState = { resourceFavourites: ResourceFavouritesState };

export const selectFavouriteIds = (state: RootState) => state.resourceFavourites.ids;
export const selectIsFavourite = (id: string) => createSelector(selectFavouriteIds, (ids) => ids.includes(id));

export default resourceFavouritesSlice.reducer;
