import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resetStore, store } from "../../../store";
import ClientDashboard from "./ClientDashboard";

let quoteRows: { content: string; author: string }[] = [];

vi.mock("@context/AuthContext", () => ({
  useAuth: () => ({
    authUser: { id: "client-1" },
    userProfile: { id: "client-1", first_name: "Ada", focus_keywords: ["hope"] },
    displayName: "Ada",
  }),
}));
vi.mock("@Hooks/useRealtimeTable", () => ({ useRealtimeTable: vi.fn() }));
vi.mock("@services/inspirationalQuotesApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@services/inspirationalQuotesApi")>()),
  useGetQuotesByTagQuery: () => ({ data: quoteRows }),
}));
vi.mock("@components/shared/NextSessionCard/NextSessionCard", () => ({
  default: () => <div data-testid="next-session" />,
}));
vi.mock("@components/shared/ProgressChart/ProgressChart", () => ({
  default: () => <div data-testid="progress-chart" />,
}));
vi.mock("@/lib/supabase", () => {
  const q: Record<string, unknown> = {};
  const chain = () => q;
  for (const m of ["select", "eq", "neq", "order", "limit", "in", "gte", "lte", "is"]) q[m] = chain;
  q.maybeSingle = () => Promise.resolve({ data: null, error: null });
  // biome-ignore lint/suspicious/noThenProperty: mimics supabase-js's thenable query builder
  q.then = (res: (v: { data: never[]; error: null }) => unknown) => res({ data: [], error: null });
  return { supabase: { from: () => q, rpc: () => Promise.resolve({ data: [], error: null }) } };
});

afterEach(() => {
  cleanup();
  store.dispatch(resetStore());
  vi.clearAllMocks();
  quoteRows = [];
});

function renderPage() {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <ClientDashboard />
      </MemoryRouter>
    </Provider>,
  );
}

describe("ClientDashboard", () => {
  it("greets the client by display name once data has loaded", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: /Good (morning|afternoon|evening), Ada/ })).toBeInTheDocument();
  });

  it("renders an inspirational quote when one is returned for the focus keyword", async () => {
    quoteRows = [{ content: "Courage, dear heart.", author: "C.S. Lewis" }];
    renderPage();
    expect(await screen.findByRole("heading", { name: "Courage, dear heart." })).toBeInTheDocument();
    expect(screen.getByText("C.S. Lewis")).toBeInTheDocument();
  });

  it("shows a loader (not the greeting) while the slices are still idle", () => {
    renderPage();
    expect(screen.queryByRole("heading", { name: /Good (morning|afternoon|evening)/ })).not.toBeInTheDocument();
  });
});
