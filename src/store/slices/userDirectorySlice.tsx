import { createAsyncThunk, createSelector, createSlice } from "@reduxjs/toolkit";

import { supabase } from "../../lib/supabase.js";
import type { UserProfile } from "../../models/globalTypes.js";

type UserDirectoryState = {
  users: UserProfile[];
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
};

const initialState: UserDirectoryState = {
  users: [],
  status: "idle",
  error: null,
};

export const fetchAllUsers = createAsyncThunk("userDirectory/fetchAllUsers", async (_, { rejectWithValue }) => {
  const { data, error } = await supabase.from("users").select("*");

  if (error) return rejectWithValue(error.message);

  return data;
});

export const deleteUser = createAsyncThunk("userDirectory/deleteUser", async (id: string, { rejectWithValue }) => {
  const { error } = await supabase.rpc("delete_user_by_id", { target_user_id: id });

  if (error) return rejectWithValue(error.message);

  return id;
});

export const deleteOwnAccount = createAsyncThunk(
  "userDirectory/deleteOwnAccount",
  async (id: string, { rejectWithValue }) => {
    const { error } = await supabase.rpc("delete_own_account");

    if (error) return rejectWithValue(error.message);

    return id;
  },
);

// Deactivate a client: relationship ended, all history retained. Optionally
// anonymise their personal details in the same call. Reversible via
// unarchiveClient (the anonymisation is not).
export const archiveClient = createAsyncThunk(
  "userDirectory/archiveClient",
  async (
    { id, reason, anonymise = false }: { id: string; reason?: string | null; anonymise?: boolean },
    { rejectWithValue },
  ) => {
    const { error } = await supabase.rpc("admin_archive_client", {
      target_user_id: id,
      p_reason: reason ?? null,
      p_anonymise: anonymise,
    });

    if (error) return rejectWithValue(error.message);

    return { id, anonymise };
  },
);

export const unarchiveClient = createAsyncThunk(
  "userDirectory/unarchiveClient",
  async (id: string, { rejectWithValue }) => {
    const { error } = await supabase.rpc("admin_unarchive_client", { target_user_id: id });

    if (error) return rejectWithValue(error.message);

    return id;
  },
);

const userDirectorySlice = createSlice({
  name: "userDirectory",
  initialState,
  reducers: {},

  extraReducers: (builder) => {
    builder
      .addCase(fetchAllUsers.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchAllUsers.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.users = action.payload;
      })
      .addCase(fetchAllUsers.rejected, (state, action) => {
        state.status = "failed";
        (state.error as string) = action.payload;
      })
      .addCase(deleteUser.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.users = state.users.filter((u) => u.id !== action.payload);
      })
      .addCase(deleteUser.rejected, (state, action) => {
        state.status = "failed";
        (state.error as string) = action.payload;
      })
      .addCase(deleteOwnAccount.fulfilled, (state, action) => {
        state.users = state.users.filter((u) => u.id !== action.payload);
      })
      .addCase(deleteOwnAccount.rejected, (state, action) => {
        state.status = "failed";
        (state.error as string) = action.payload as string;
      })
      .addCase(archiveClient.fulfilled, (state, action) => {
        state.status = "succeeded";
        const { id, anonymise } = action.payload;
        state.users = state.users.map((u) =>
          u.id === id
            ? {
                ...u,
                archived_at: new Date().toISOString(),
                disabled: true,
                ...(anonymise
                  ? { anonymised_at: new Date().toISOString(), first_name: "", last_name: "", display_name: null }
                  : {}),
              }
            : u,
        );
      })
      .addCase(archiveClient.rejected, (state, action) => {
        state.status = "failed";
        (state.error as string) = action.payload as string;
      })
      .addCase(unarchiveClient.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.users = state.users.map((u) =>
          u.id === action.payload ? { ...u, archived_at: null, archived_reason: null, disabled: false } : u,
        );
      })
      .addCase(unarchiveClient.rejected, (state, action) => {
        state.status = "failed";
        (state.error as string) = action.payload as string;
      })
      .addCase("RESET_ALL", () => initialState);
  },
});

// Selectors
export const selectAllUsers = (state: { userDirectory: UserDirectoryState }) => state.userDirectory.users;

export const selectUserById = (id: string) => (state: { userDirectory: UserDirectoryState }) =>
  state.userDirectory.users.find((u) => u.id === id);

export const selectClientUsers = createSelector(
  // 1. input: grab the users array from state
  (state: { userDirectory: UserDirectoryState }) => state.userDirectory.users,

  // 2. result: filter it — only runs if users array actually changed
  (users) => users.filter((u) => u.role === "client"),
);

export const selectUserCount = (state: { userDirectory: UserDirectoryState }) => state.userDirectory.users.length;

export default userDirectorySlice.reducer;
