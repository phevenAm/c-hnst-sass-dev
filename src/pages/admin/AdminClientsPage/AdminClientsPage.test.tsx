import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";

import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { store } from "../../../store";
import { fetchQuestionnaires } from "../../../store/slices/questionnairesSlice";
import { fetchAllResponses } from "../../../store/slices/responsesSlice";
import { fetchAllUsers } from "../../../store/slices/userDirectorySlice";
import AdminClientsPage from "./AdminClientsPage";

test("renders AdminClientsPage component", () => {
  // The page shows a loading spinner while any of these slices is "idle" or
  // "loading" (idle = not yet fetched). In a test there's no live fetch, so we
  // seed each slice to "succeeded" with empty data to render past the guard.
  store.dispatch(fetchAllUsers.fulfilled([], "test", undefined));
  store.dispatch(fetchQuestionnaires.fulfilled([], "test", undefined));
  store.dispatch(fetchAllResponses.fulfilled([], "test", undefined));

  render(
    <Provider store={store}>
      <BrowserRouter>
        <AdminClientsPage />
      </BrowserRouter>
    </Provider>,
  );

  expect(screen.getByRole("heading", { name: /clients/i })).toBeInTheDocument();
});
