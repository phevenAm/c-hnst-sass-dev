import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Resource } from "@models/globalTypes";

import { resetStore, store } from "../../../store";
import { fetchResources } from "../../../store/slices/resourcesSlice";
import AdminResourcesPage from "./AdminResourcesPage";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockAuth = vi.fn();
vi.mock("@context/AuthContext", () => ({ useAuth: () => mockAuth() }));

const showToast = vi.fn();
vi.mock("@context/ToastContext", () => ({ useToast: () => ({ showToast }) }));

// ResourceModal (reused from the client page) pulls in the real PDF viewer.
vi.mock("@components/shared/PdfViewer/PdfViewer", () => ({
  default: ({ title }: { title: string }) => <div data-testid="pdf-viewer">{title}</div>,
}));

const updateSpy = vi.fn();
vi.mock("@lib/supabase", () => ({
  supabase: {
    from: (table: string) => ({
      update: (payload: Record<string, unknown>) => {
        updateSpy(table, payload);
        return { eq: () => Promise.resolve({ data: null, error: null }) };
      },
    }),
  },
}));

// ─── Fixtures / helpers ─────────────────────────────────────────────────────

const resource = (over: Partial<Resource> = {}): Resource =>
  ({
    id: "r-1",
    admin_id: "admin-1",
    title: "Grounding techniques",
    summary: "A short read.",
    type: "article",
    category: "Coping skills",
    content: "body",
    url: null,
    videoUrl: null,
    is_published: true,
    is_sensitive: false,
    is_pinned: false,
    is_demo: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    ...over,
  }) as Resource;

function seed(resources: Resource[]) {
  store.dispatch(fetchResources.fulfilled(resources, "test", undefined));
}

function renderPage() {
  return render(
    <Provider store={store}>
      <BrowserRouter>
        <AdminResourcesPage />
      </BrowserRouter>
    </Provider>,
  );
}

beforeEach(() => {
  mockAuth.mockReturnValue({ isDemo: false, userProfile: { id: "admin-1" } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  store.dispatch(resetStore());
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("AdminResourcesPage — pinning", () => {
  it("pins an unpinned resource (happy path)", async () => {
    seed([resource({ id: "r-1", title: "Grounding techniques", is_pinned: false })]);
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Pin" }));

    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith("resources", expect.objectContaining({ is_pinned: true })),
    );
  });

  it("unpins a pinned resource (happy path)", async () => {
    seed([resource({ id: "r-1", is_pinned: true })]);
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Unpin" }));

    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith("resources", expect.objectContaining({ is_pinned: false })),
    );
  });

  it("does not pin in demo mode — it toasts instead (sad path)", () => {
    mockAuth.mockReturnValue({ isDemo: true, userProfile: { id: "admin-1" } });
    seed([resource({ id: "r-1" })]);
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Pin" }));

    expect(showToast).toHaveBeenCalledWith("Demo mode — changes are not saved.");
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("shows a Pinned badge on pinned resources", () => {
    seed([resource({ id: "r-1", is_pinned: true })]);
    renderPage();

    expect(screen.getByText("Pinned")).toBeInTheDocument();
  });

  it("lists pinned resources ahead of unpinned ones", () => {
    seed([
      resource({ id: "plain", title: "Plain resource", is_pinned: false }),
      resource({ id: "pinned", title: "Pinned resource", is_pinned: true }),
    ]);
    renderPage();

    const titles = screen.getAllByText(/resource$/).map((el) => el.textContent);
    expect(titles.indexOf("Pinned resource")).toBeLessThan(titles.indexOf("Plain resource"));
  });
});
