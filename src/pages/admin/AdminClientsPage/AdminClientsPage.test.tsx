import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { store } from "../../../store";
import { fetchPracticeSettings } from "../../../store/slices/practiceSettingsSlice";
import { fetchQuestionnaires } from "../../../store/slices/questionnairesSlice";
import { fetchAllResponses } from "../../../store/slices/responsesSlice";
import { fetchAllUsers } from "../../../store/slices/userDirectorySlice";
import AdminClientsPage from "./AdminClientsPage";

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ userProfile: { id: "admin-1" }, practiceSettings: null, isDemo: false }),
}));

const showToast = vi.fn();
vi.mock("@/context/ToastContext", () => ({ useToast: () => ({ showToast }) }));

const updateSpy = vi.fn();
vi.mock("@lib/supabase", () => ({
  supabase: {
    from: () => ({
      update: (payload: Record<string, unknown>) => {
        updateSpy(payload);
        return { eq: () => Promise.resolve({ data: null, error: null }) };
      },
    }),
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPage() {
  return render(
    <Provider store={store}>
      <BrowserRouter>
        <AdminClientsPage />
      </BrowserRouter>
    </Provider>,
  );
}

test("renders AdminClientsPage component", () => {
  // The page shows a loading spinner while any of these slices is "idle" or
  // "loading" (idle = not yet fetched). In a test there's no live fetch, so we
  // seed each slice to "succeeded" with empty data to render past the guard.
  store.dispatch(fetchAllUsers.fulfilled([], "test", undefined));
  store.dispatch(fetchQuestionnaires.fulfilled([], "test", undefined));
  store.dispatch(fetchAllResponses.fulfilled([], "test", undefined));

  renderPage();

  // level: 1 — the empty-state ("No clients yet") also renders a heading
  // matching /clients/i, so an unscoped query is ambiguous.
  expect(screen.getByRole("heading", { name: /clients/i, level: 1 })).toBeInTheDocument();
});

test("empty state offers all three ways to add a client", () => {
  store.dispatch(fetchAllUsers.fulfilled([], "test", undefined));
  store.dispatch(fetchQuestionnaires.fulfilled([], "test", undefined));
  store.dispatch(fetchAllResponses.fulfilled([], "test", undefined));

  renderPage();

  // Scoped to the empty state itself — the page header's SplitButton also has
  // its own "Invite a client" button, so an unscoped query is ambiguous.
  const emptyState = screen.getByText("No clients yet").closest("div") as HTMLElement;
  expect(within(emptyState).getByRole("button", { name: "Invite a client" })).toBeInTheDocument();
  expect(within(emptyState).getByRole("button", { name: "Add offline client" })).toBeInTheDocument();
  expect(within(emptyState).getByRole("button", { name: "Import from CSV" })).toBeInTheDocument();
});

// Client lifecycle: a deactivated (archived_at set) client is kept but must not
// appear on the Active tab — it lives on the Deactivated tab with a Reactivate
// action, and is not counted as active.
test("deactivated clients are on their own tab, not the active list", () => {
  store.dispatch(
    fetchAllUsers.fulfilled(
      [
        { id: "c-active", role: "client", first_name: "Ada", last_name: "Active", deleted_at: null, archived_at: null },
        {
          id: "c-archived",
          role: "client",
          first_name: "Bob",
          last_name: "Gone",
          deleted_at: null,
          archived_at: "2026-08-01T00:00:00Z",
        },
      ],
      "test",
      undefined,
    ),
  );
  store.dispatch(fetchQuestionnaires.fulfilled([], "test", undefined));
  store.dispatch(fetchAllResponses.fulfilled([], "test", undefined));

  renderPage();

  // Active tab is the default: shows Ada, not Bob. Header counts only Ada.
  expect(screen.getByText("1 active", { exact: false })).toBeInTheDocument();
  expect(screen.getByText("Ada Active")).toBeInTheDocument();
  expect(screen.queryByText("Bob Gone")).not.toBeInTheDocument();

  // Tab labels carry counts.
  expect(screen.getByRole("tab", { name: /Active \(1\)/ })).toBeInTheDocument();
  const deactivatedTab = screen.getByRole("tab", { name: /Deactivated \(1\)/ });

  // Switching to it reveals Bob + the Reactivate action.
  fireEvent.click(deactivatedTab);
  expect(screen.getByText("Bob Gone")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reactivate" })).toBeInTheDocument();
  expect(screen.queryByText("Ada Active")).not.toBeInTheDocument();
});

test("a paused client stays in the active list but is marked with a Paused badge", () => {
  store.dispatch(
    fetchAllUsers.fulfilled(
      [
        {
          id: "c-paused",
          role: "client",
          first_name: "Ada",
          last_name: "Paused",
          deleted_at: null,
          archived_at: null,
          disabled: true,
        },
      ],
      "test",
      undefined,
    ),
  );
  store.dispatch(fetchQuestionnaires.fulfilled([], "test", undefined));
  store.dispatch(fetchAllResponses.fulfilled([], "test", undefined));

  renderPage();

  expect(screen.getByText("Ada Paused")).toBeInTheDocument();
  expect(screen.getByText("Paused")).toBeInTheDocument();
  // still counted as active — pause is temporary, not a deactivation
  expect(screen.getByText("1 active", { exact: false })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: /Deactivated \(0\)/ })).toBeInTheDocument();
});

test("paginates the active list at 25 with a Show more control", () => {
  const many = Array.from({ length: 30 }, (_, i) => ({
    id: `c-${i}`,
    role: "client",
    first_name: `Client${i}`,
    last_name: "X",
    email: `c${i}@example.com`,
    deleted_at: null,
    archived_at: null,
  }));
  store.dispatch(fetchAllUsers.fulfilled(many, "test", undefined));
  store.dispatch(fetchQuestionnaires.fulfilled([], "test", undefined));
  store.dispatch(fetchAllResponses.fulfilled([], "test", undefined));

  renderPage();

  // First page: 25 rows, row 26 not yet rendered.
  expect(screen.getByText("Client24 X")).toBeInTheDocument();
  expect(screen.queryByText("Client25 X")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Show 5 more \(5 left\)/ }));

  expect(screen.getByText("Client25 X")).toBeInTheDocument();
  expect(screen.getByText("Client29 X")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Show .* more/ })).not.toBeInTheDocument();
});

test("the Deactivated tab shows (0) and an empty message when every client is active", () => {
  store.dispatch(
    fetchAllUsers.fulfilled(
      [{ id: "c-active", role: "client", first_name: "Ada", last_name: "Active", deleted_at: null, archived_at: null }],
      "test",
      undefined,
    ),
  );
  store.dispatch(fetchQuestionnaires.fulfilled([], "test", undefined));
  store.dispatch(fetchAllResponses.fulfilled([], "test", undefined));

  renderPage();

  fireEvent.click(screen.getByRole("tab", { name: /Deactivated \(0\)/ }));
  expect(screen.getByText("No deactivated clients.")).toBeInTheDocument();
});

// Regression: fires once, the first time an admin's client count goes from 0
// to 1 (gated on first_client_milestone_shown, not on the setup wizard), and
// persists the flag so it never shows again.
test("shows the first-client tips modal once the admin has their first client, and it doesn't reopen after closing", async () => {
  store.dispatch(
    fetchAllUsers.fulfilled(
      [{ id: "client-1", role: "client", first_name: "Ada", last_name: "Lovelace", deleted_at: null }],
      "test",
      undefined,
    ),
  );
  store.dispatch(fetchQuestionnaires.fulfilled([], "test", undefined));
  store.dispatch(fetchAllResponses.fulfilled([], "test", undefined));
  store.dispatch(
    fetchPracticeSettings.fulfilled({ admin_id: "admin-1", first_client_milestone_shown: false }, "test", undefined),
  );

  renderPage();

  expect(await screen.findByText("Your first client is set up")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Got it" }));

  await waitFor(() => {
    expect(updateSpy).toHaveBeenCalledWith({ first_client_milestone_shown: true });
  });
  expect(screen.queryByText("Your first client is set up")).not.toBeInTheDocument();
});
