import { createAsyncThunk, createSelector, createSlice } from "@reduxjs/toolkit";

import { supabase } from "../../lib/supabase";
import type { Todo } from "../../models/globalTypes";

type ToDoState = {
  status: string;
  todos: Todo[];
  error: string | null;
};

const initialState: ToDoState = {
  status: "idle",
  todos: [],
  error: null,
};

export const fetchAllTodos = createAsyncThunk<Todo[], void, { rejectValue: string }>(
  "todos/fetchAllTodos",
  async (_, { rejectWithValue }) => {
    const { data, error } = await supabase
      .from("admin_todos")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) return rejectWithValue(error.message || "Failed to fetch todo list, please reload and try again");

    return data ?? [];
  },
);

export const createTodoItem = createAsyncThunk<
  Todo,
  Omit<Todo, "id" | "created_at" | "completed" | "completed_at" | "admin_id">,
  { rejectValue: string }
>("todos/createTodoItem", async (todo, { rejectWithValue }) => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return rejectWithValue("Not authenticated");

  const { data, error } = await supabase
    .from("admin_todos")
    .insert({ ...todo, admin_id: session.user.id })
    .select()
    .single();

  if (error) return rejectWithValue(error.message || "Failed to create todo item, please reload and try again");

  return data as Todo;
});

export const deleteTodoItem = createAsyncThunk<string, string>(
  "todos/deleteTodoitem",
  async (id, { rejectWithValue }) => {
    const { error } = await supabase.from("admin_todos").delete().eq("id", id);

    if (error) {
      return rejectWithValue((error.message as string) || "Failed to delete, please reload and try again");
    }
    return id;
  },
);

export const updateTodoItem = createAsyncThunk<Todo, Todo, { rejectValue: string }>(
  "todos/updateTodoItem",
  async ({ id, admin_id, ...rest }, { rejectWithValue }) => {
    const { data, error } = await supabase.from("admin_todos").update(rest).eq("id", id).select().single();
    if (error) return rejectWithValue(error.message || "Sorry, failed to update. Please refresh and try again");
    return data as Todo;
  },
);

// export const updateResource = createAsyncThunk<Resource, UpdateResource>(
//   "resources/updateResource",
//   async ({ id, ...fields }, { rejectWithValue }) => {
//     const { data, error } = await supabase
//       .from("resources")
//       .update({ ...fields, updated_at: new Date().toISOString() })
//       .eq("id", id)
//       .select()
//       .single();
//     if (error) return rejectWithValue(error.message);
//     return data;
//   },
// );

// export const deleteResource = createAsyncThunk<string, string>(
//   "resources/deleteResource",
//   async (id, { rejectWithValue }) => {
//     const { error } = await supabase.from("resources").delete().eq("id", id);
//     if (error) return rejectWithValue(error.message);
//     return id;
//   },
// );

//!Slice
const todoSlice = createSlice({
  name: "todo",
  initialState,
  reducers: {
    clearResponseError: (state) => {
      state.error = null;
    },
  },
  extraReducers(builder) {
    builder
      .addCase("RESET_ALL", () => initialState)
      .addCase(fetchAllTodos.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchAllTodos.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload as string;
      })
      .addCase(fetchAllTodos.fulfilled, (state, action) => {
        state.todos = action.payload;
        state.status = "succeeded";
      })
      .addCase(createTodoItem.pending, (state) => {
        state.status = "loading";
      })
      .addCase(createTodoItem.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload;
      })
      .addCase(createTodoItem.fulfilled, (state, action) => {
        state.todos.unshift(action.payload);
        state.status = "succeeded";
      })
      .addCase(deleteTodoItem.fulfilled, (state, action) => {
        state.status = "succeeded";
        // const todoIndex = state.todos.indexOf(action.payload)
        state.todos = state.todos.filter((s) => s.id !== action.payload);
      })
      .addCase(deleteTodoItem.pending, (state) => {
        state.status = "loading";
      })
      .addCase(deleteTodoItem.rejected, (state) => {
        state.status = "failed";
      })
      .addCase(updateTodoItem.pending, (state) => {
        state.status = "loading";
      })
      .addCase(updateTodoItem.rejected, (state) => {
        state.status = "failed";
      })
      .addCase(updateTodoItem.fulfilled, (state, action) => {
        state.status = "succeeded";
        const targetIndex = state.todos.findIndex((s) => s.id === action.payload.id);

        if (targetIndex !== -1) {
          state.todos[targetIndex] = action.payload;
        }
      });
  },
});

export const selectOutstandingTodos = createSelector(
  (state: { todos: ToDoState }) => state.todos.todos,
  (todos) => todos.filter((t) => t.completed === false),
);

export const selectCompletedTodos = createSelector(
  (state: { todos: ToDoState }) => state.todos.todos,
  (todos) => todos.filter((t) => t.completed),
);

export const { clearResponseError } = todoSlice.actions;
export default todoSlice.reducer;
