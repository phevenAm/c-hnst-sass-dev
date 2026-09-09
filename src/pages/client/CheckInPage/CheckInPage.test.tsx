import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetStore, store } from "../../../store";
import CheckInPage from "./CheckInPage";

// Per-table data the mocked supabase returns. Tests set assignmentRows before
// rendering; everything else stays empty.
let assignmentRows: unknown[] = [];

vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({ authUser: { id: "client-1" }, userProfile: { first_name: "Ada" }, isDemo: false }),
}));
vi.mock("../../../context/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("../../../Hooks/useRealtimeTable", () => ({ useRealtimeTable: vi.fn() }));
vi.mock("../../../lib/supabase", () => {
  const make = (table: string) => {
    const rows = () => (table === "questionnaire_assignments" ? assignmentRows : []);
    const q: Record<string, unknown> = {};
    const chain = () => q;
    for (const m of ["select", "eq", "neq", "order", "limit", "in", "gte", "lte", "is"]) q[m] = chain;
    q.maybeSingle = () => Promise.resolve({ data: null, error: null });
    q.single = () => Promise.resolve({ data: null, error: null });
    // biome-ignore lint/suspicious/noThenProperty: mimics supabase-js's thenable query builder
    q.then = (res: (v: { data: unknown[]; error: null }) => unknown) => res({ data: rows(), error: null });
    return q;
  };
  return { supabase: { from: (t: string) => make(t), rpc: () => Promise.resolve({ data: [], error: null }) } };
});

beforeEach(() => {
  assignmentRows = [];
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
        <CheckInPage />
      </MemoryRouter>
    </Provider>,
  );
}

describe("CheckInPage", () => {
  it("renders the page and the empty state once loading resolves with nothing due", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Check-in" })).toBeInTheDocument();
    expect(screen.getByText("You have no check-ins due right now.")).toBeInTheDocument();
  });

  it("renders the assigned questionnaire's title and questions when a weekly check-in is due", async () => {
    assignmentRows = [
      {
        id: "a1",
        user_id: "client-1",
        prompt_again_at: null,
        questionnaires: {
          id: "q1",
          title: "Weekly wellbeing",
          is_active: true,
          form_type: "check_in",
          frequency: "weekly",
          questions: [{ id: "qq1", questionnaire_id: "q1", text: "How are you sleeping?", type: "scale", position: 0 }],
        },
      },
    ];
    renderPage();
    expect(await screen.findByRole("heading", { name: "Weekly wellbeing" })).toBeInTheDocument();
    expect(screen.getByText("How are you sleeping?")).toBeInTheDocument();
    expect(screen.queryByText("You have no check-ins due right now.")).not.toBeInTheDocument();
  });
});
