// ============================================================
// REDUX STORE CONFIGURATION
//
// configureStore() from @reduxjs/toolkit:
//   - Sets up the store with Redux DevTools enabled
//   - Adds redux-thunk middleware by default
//   - Uses the provided slices as reducers
// ============================================================

import { configureStore, Middleware } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";

import { inspirationalQuotesApi } from "../services/inspirationalQuotesApi";
import adminPrivateEventsReducer from "./slices/adminPrivateEventsSlice";
import auditLogsReducer from "./slices/auditLogsSlice";
import availabilityReducer from "./slices/availabilitySlice";
import clientStubsReducer from "./slices/clientStubsSlice";
import assignmentsReducer from "./slices/questionnaireAssignmentsSlice";
import questionnairesReducer from "./slices/questionnairesSlice";
import resourcesReducer from "./slices/resourcesSlice";
import responsesReducer from "./slices/responsesSlice";
import sessionsReducer from "./slices/sessionsSlice";
import todoReducer from "./slices/TodoSlice";
import tagsReducer from "./slices/tagsSlice";
import themeReducer from "./slices/themeSlice";
import userDirectoryReducer from "./slices/userDirectorySlice";

export const store = configureStore({
  reducer: {
    userDirectory: userDirectoryReducer,
    questionnaires: questionnairesReducer,
    assignments: assignmentsReducer,
    responses: responsesReducer,
    resources: resourcesReducer,
    sessions: sessionsReducer,
    availability: availabilityReducer,
    adminPrivateEvents: adminPrivateEventsReducer,
    tags: tagsReducer,
    theme: themeReducer,
    auditLogs: auditLogsReducer,
    todos: todoReducer,
    clientStubs: clientStubsReducer,
    [inspirationalQuotesApi.reducerPath]: inspirationalQuotesApi.reducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(inspirationalQuotesApi.middleware as Middleware),
});

export const resetStore = () => ({ type: "RESET_ALL" as const });

setupListeners(store.dispatch);
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export default store;
