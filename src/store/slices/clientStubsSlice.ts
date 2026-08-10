import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import { supabase } from "../../lib/supabase.js";
import type { ClientStub } from "../../models/globalTypes";

type ClientStubsState = {
  stubs: ClientStub[];
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
};

const initialState: ClientStubsState = {
  stubs: [],
  status: "idle",
  error: null,
};

export const fetchClientStubs = createAsyncThunk("clientStubs/fetchAll", async (_, { rejectWithValue }) => {
  const { data, error } = await supabase.from("client_stubs").select("*").order("created_at", { ascending: false });
  if (error) return rejectWithValue(error.message);
  return data as ClientStub[];
});

export const createClientStub = createAsyncThunk(
  "clientStubs/create",
  async (
    stub: Pick<ClientStub, "created_by" | "first_name" | "last_name"> & {
      email?: string | null;
      codename?: string | null;
    },
    { rejectWithValue },
  ) => {
    const { data, error } = await supabase.from("client_stubs").insert(stub).select().single();
    if (error) return rejectWithValue(error.message);
    return data as ClientStub;
  },
);

export const updateClientStub = createAsyncThunk(
  "clientStubs/update",
  async (
    { id, ...fields }: { id: string } & Partial<Omit<ClientStub, "id" | "created_at" | "created_by">>,
    { rejectWithValue },
  ) => {
    const { data, error } = await supabase.from("client_stubs").update(fields).eq("id", id).select().single();
    if (error) return rejectWithValue(error.message);
    return data as ClientStub;
  },
);

export const deleteClientStub = createAsyncThunk("clientStubs/delete", async (id: string, { rejectWithValue }) => {
  const { error } = await supabase.from("client_stubs").delete().eq("id", id);
  if (error) return rejectWithValue(error.message);
  return id;
});

const clientStubsSlice = createSlice({
  name: "clientStubs",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchClientStubs.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchClientStubs.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.stubs = action.payload;
      })
      .addCase(fetchClientStubs.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload as string;
      })
      .addCase(createClientStub.fulfilled, (state, action) => {
        state.stubs.unshift(action.payload);
      })
      .addCase(updateClientStub.fulfilled, (state, action) => {
        const idx = state.stubs.findIndex((s) => s.id === action.payload.id);
        if (idx !== -1) state.stubs[idx] = action.payload;
      })
      .addCase(deleteClientStub.fulfilled, (state, action) => {
        state.stubs = state.stubs.filter((s) => s.id !== action.payload);
      })
      .addCase("RESET_ALL", () => initialState);
  },
});

export const selectAllStubs = (state: { clientStubs: ClientStubsState }) => state.clientStubs.stubs;

export const selectStubById = (id: string) => (state: { clientStubs: ClientStubsState }) =>
  state.clientStubs.stubs.find((s) => s.id === id);

export default clientStubsSlice.reducer;
