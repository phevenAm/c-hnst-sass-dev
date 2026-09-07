import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { store } from "../../../store";
import { fetchClientStubs } from "../../../store/slices/clientStubsSlice";
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
const rpcSpy = vi.fn(() => Promise.resolve({ data: null, error: null }));
vi.mock("@lib/supabase", () => ({
  supabase: {
    from: () => ({
      update: (payload: Record<string, unknown>) => {
        updateSpy(payload);
        return {
          // Supports both `await update().eq()` (fire-and-forget) and
          // `update().eq().select().single()` (needs the row back).
          eq: () => {
            const done = Promise.resolve({ data: null, error: null }) as Promise<unknown> & {
              select?: () => { single: () => Promise<unknown> };
            };
            done.select = () => ({
              single: () => Promise.resolve({ data: { id: "s-1", ...payload }, error: null }),
            });
            return done;
          },
        };
      },
    }),
    rpc: (name: string, args: Record<string, unknown>) => rpcSpy(name, args),
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

test("offline clients live on the Active tab (no separate Offline tab)", () => {
  store.dispatch(
    fetchAllUsers.fulfilled(
      [{ id: "c-active", role: "client", first_name: "Ada", last_name: "Active", deleted_at: null, archived_at: null }],
      "test",
      undefined,
    ),
  );
  store.dispatch(
    fetchClientStubs.fulfilled(
      [{ id: "s-1", first_name: "Ozzy", last_name: "Offline", email: "ozzy@example.com", linked_user_id: null }],
      "test",
      undefined,
    ),
  );
  store.dispatch(fetchQuestionnaires.fulfilled([], "test", undefined));
  store.dispatch(fetchAllResponses.fulfilled([], "test", undefined));

  renderPage();

  // Two tabs only; Active counts the real client + the offline record.
  expect(screen.getByRole("tab", { name: /Active \(2\)/ })).toBeInTheDocument();
  expect(screen.queryByRole("tab", { name: /Offline/ })).not.toBeInTheDocument();

  // On the Active tab, the two groups are shown under their own subheadings.
  expect(screen.getByRole("heading", { name: /On the platform \(1\)/ })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /Offline \(1\)/ })).toBeInTheDocument();
  expect(screen.getByText("Ada Active")).toBeInTheDocument();
  expect(screen.getByText("Ozzy Offline")).toBeInTheDocument();
});

test("online and offline groups on the Active tab paginate independently", () => {
  const users = Array.from({ length: 30 }, (_, i) => ({
    id: `u-${i}`,
    role: "client",
    first_name: `On${i}`,
    last_name: "Line",
    email: `on${i}@example.com`,
    deleted_at: null,
    archived_at: null,
  }));
  const stubs = Array.from({ length: 30 }, (_, i) => ({
    id: `st-${i}`,
    first_name: `Off${i}`,
    last_name: "Line",
    email: `off${i}@example.com`,
    linked_user_id: null,
  }));
  store.dispatch(fetchAllUsers.fulfilled(users, "test", undefined));
  store.dispatch(fetchClientStubs.fulfilled(stubs, "test", undefined));
  store.dispatch(fetchQuestionnaires.fulfilled([], "test", undefined));
  store.dispatch(fetchAllResponses.fulfilled([], "test", undefined));

  renderPage();

  // Each group caps at 25 with its own Show more.
  expect(screen.getByText("On24 Line")).toBeInTheDocument();
  expect(screen.queryByText("On25 Line")).not.toBeInTheDocument();
  expect(screen.getByText("Off24 Line")).toBeInTheDocument();
  expect(screen.queryByText("Off25 Line")).not.toBeInTheDocument();

  const showMores = screen.getAllByRole("button", { name: /Show \d+ more/ });
  expect(showMores).toHaveLength(2);

  // Expanding the online group leaves the offline group where it was.
  fireEvent.click(showMores[0]);
  expect(screen.getByText("On25 Line")).toBeInTheDocument();
  expect(screen.queryByText("Off25 Line")).not.toBeInTheDocument();
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
  store.dispatch(fetchClientStubs.fulfilled([], "test", undefined)); // shared store — clear stubs from earlier tests
  store.dispatch(fetchQuestionnaires.fulfilled([], "test", undefined));
  store.dispatch(fetchAllResponses.fulfilled([], "test", undefined));

  renderPage();

  // First page stops at PAGE_SIZE (25): row 25 (0-indexed 24) shows, row 26 doesn't.
  // Assertions avoid exact leftover counts — the test store is a shared singleton
  // and other suites can leave a stray row behind.
  expect(screen.getByText("Client24 X")).toBeInTheDocument();
  expect(screen.queryByText("Client25 X")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Show \d+ more/ }));

  expect(screen.getByText("Client25 X")).toBeInTheDocument();
  expect(screen.getByText("Client29 X")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Show \d+ more/ })).not.toBeInTheDocument();
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

// Client lifecycle: the row's "More options" menu must offer a Deactivate
// path that archives (keeps history) rather than only Delete — the online
// client version calls the admin_archive_client RPC.
test("online client row: Deactivate archives the client via admin_archive_client", async () => {
  store.dispatch(
    fetchAllUsers.fulfilled(
      [{ id: "c-1", role: "client", first_name: "Dana", last_name: "Doe", deleted_at: null, archived_at: null }],
      "test",
      undefined,
    ),
  );
  store.dispatch(fetchClientStubs.fulfilled([], "test", undefined));
  store.dispatch(fetchQuestionnaires.fulfilled([], "test", undefined));
  store.dispatch(fetchAllResponses.fulfilled([], "test", undefined));

  renderPage();

  fireEvent.click(screen.getByRole("button", { name: "More options" }));
  fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));

  // Confirm dialog explains history is kept, then confirm.
  expect(screen.getByText(/nothing is deleted/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Deactivate client" }));

  await waitFor(() => {
    expect(rpcSpy).toHaveBeenCalledWith("admin_archive_client", {
      target_user_id: "c-1",
      p_reason: null,
      p_anonymise: false,
    });
  });
});

test("offline stub row: Deactivate sets archived_at instead of deleting", async () => {
  store.dispatch(fetchAllUsers.fulfilled([], "test", undefined));
  store.dispatch(
    fetchClientStubs.fulfilled(
      [{ id: "s-1", first_name: "Otto", last_name: "Offline", email: null, linked_user_id: null, archived_at: null }],
      "test",
      undefined,
    ),
  );
  store.dispatch(fetchQuestionnaires.fulfilled([], "test", undefined));
  store.dispatch(fetchAllResponses.fulfilled([], "test", undefined));

  renderPage();

  fireEvent.click(screen.getByRole("button", { name: "More options" }));
  fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
  fireEvent.click(screen.getByRole("button", { name: "Deactivate client" }));

  await waitFor(() => {
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ archived_at: expect.any(String) }));
  });
});

test("an archived offline stub shows on the Deactivated tab with a Reactivate action", () => {
  store.dispatch(fetchAllUsers.fulfilled([], "test", undefined));
  store.dispatch(
    fetchClientStubs.fulfilled(
      [
        {
          id: "s-arch",
          first_name: "Prue",
          last_name: "Past",
          email: null,
          linked_user_id: null,
          archived_at: "2026-08-10T00:00:00Z",
        },
      ],
      "test",
      undefined,
    ),
  );
  store.dispatch(fetchQuestionnaires.fulfilled([], "test", undefined));
  store.dispatch(fetchAllResponses.fulfilled([], "test", undefined));

  renderPage();

  // Not on the Active tab.
  expect(screen.queryByText("Prue Past")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: /Deactivated \(1\)/ }));
  expect(screen.getByText("Prue Past")).toBeInTheDocument();
  expect(screen.getByText(/offline/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reactivate" })).toBeInTheDocument();
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
