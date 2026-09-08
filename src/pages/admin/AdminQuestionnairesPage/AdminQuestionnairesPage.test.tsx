import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetStore, store } from "../../../store";
import AdminQuestionnairesPage from "./AdminQuestionnairesPage";

let questionnaireRows: unknown[] = [];

vi.mock("@context/AuthContext", () => ({
  useAuth: () => ({
    isDemo: false,
    userProfile: { id: "admin-1", role: "admin" },
    practiceSettings: { admin_id: "admin-1" },
  }),
}));
vi.mock("@Hooks/useRealtimeTable", () => ({ useRealtimeTable: vi.fn() }));
vi.mock("@/lib/supabase", () => {
  const make = (table: string) => {
    const q: Record<string, unknown> = {};
    const chain = () => q;
    for (const m of ["select", "eq", "neq", "order", "limit", "in", "gte", "lte", "is"]) q[m] = chain;
    q.maybeSingle = () => Promise.resolve({ data: null, error: null });
    // biome-ignore lint/suspicious/noThenProperty: mimics supabase-js's thenable query builder
    q.then = (res: (v: { data: unknown[]; error: null }) => unknown) =>
      res({ data: table === "questionnaires" ? questionnaireRows : [], error: null });
    return q;
  };
  return { supabase: { from: (t: string) => make(t), rpc: () => Promise.resolve({ data: [], error: null }) } };
});

beforeEach(() => {
  questionnaireRows = [];
});
afterEach(() => {
  cleanup();
  store.dispatch(resetStore());
  vi.clearAllMocks();
});

function renderPage() {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <AdminQuestionnairesPage />
      </MemoryRouter>
    </Provider>,
  );
}

describe("AdminQuestionnairesPage", () => {
  it("renders the Forms heading and the list of forms once loaded", async () => {
    questionnaireRows = [
      { id: "q1", title: "Weekly wellbeing", is_active: true, form_type: "check_in", questions: [] },
      { id: "q2", title: "PHQ-9", is_active: true, form_type: "outcome_measure", questions: [] },
    ];
    renderPage();
    expect(await screen.findByRole("heading", { name: "Forms" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Weekly wellbeing" })).toBeInTheDocument();
  });

  it("opens the form builder from the New form button", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Forms" });
    await userEvent.click(screen.getByRole("button", { name: "New form" }));
    expect(await screen.findByRole("heading", { name: "New form" })).toBeInTheDocument();
  });

  it("shows a loader (not the heading) while the slices are still idle", () => {
    renderPage();
    expect(screen.queryByRole("heading", { name: "Forms" })).not.toBeInTheDocument();
  });
});
