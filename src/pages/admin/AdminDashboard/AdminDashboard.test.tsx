import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resetStore, store } from "../../../store";
import AdminDashboard from "./AdminDashboard";

vi.mock("@context/AuthContext", () => ({
  useAuth: () => ({
    userProfile: { id: "admin-1", first_name: "Sam", role: "admin" },
    practiceSettings: { admin_id: "admin-1", hidden_sections: [] },
  }),
}));
vi.mock("@Hooks/useRealtimeTable", () => ({ useRealtimeTable: vi.fn() }));
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
});

function renderPage() {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    </Provider>,
  );
}

describe("AdminDashboard", () => {
  it("renders the personalised heading once data has loaded", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Welcome, Sam" })).toBeInTheDocument();
  });

  it("shows the quick-action links into the main admin sections", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Welcome, Sam" });
    const hrefs = Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs.some((h) => h?.startsWith("/admin/clients"))).toBe(true);
    expect(hrefs.some((h) => h?.startsWith("/admin/forms"))).toBe(true);
    expect(hrefs.some((h) => h?.startsWith("/admin/scheduler"))).toBe(true);
    expect(hrefs.some((h) => h?.startsWith("/admin/finances"))).toBe(true);
  });

  it("shows a loader (not the heading) while the directory/sessions slices are still idle", () => {
    // render then immediately assert — the fetch thunks haven't resolved yet
    renderPage();
    expect(screen.queryByRole("heading", { name: "Welcome, Sam" })).not.toBeInTheDocument();
  });
});
