import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Resource } from "@models/globalTypes";

import { resetStore, store } from "../../../store";
import { fetchMyFavourites } from "../../../store/slices/resourceFavouritesSlice";
import { fetchPublishedResources } from "../../../store/slices/resourcesSlice";
import ResourcesPage from "./ResourcesPage";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockAuth = vi.fn();
vi.mock("@context/AuthContext", () => ({ useAuth: () => mockAuth() }));

// jsdom can't render the real PDF.js canvas; the agreement view just needs a marker.
vi.mock("@components/shared/PdfViewer/PdfViewer", () => ({
  default: ({ title }: { title: string }) => <div data-testid="pdf-viewer">{title}</div>,
}));

const favInsertSpy = vi.fn();
const favDeleteSpy = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: () =>
      Promise.resolve({
        data: [{ consent_enabled: true, consent_title: "Our agreement", consent_body: "", consent_pdf_url: null }],
        error: null,
      }),
    from: (table: string) => ({
      select: () => Promise.resolve({ data: [], error: null }),
      insert: (payload: Record<string, unknown>) => {
        favInsertSpy(table, payload);
        return Promise.resolve({ data: null, error: null });
      },
      delete: () => ({
        eq: () => ({
          eq: (_c: string, id: string) => {
            favDeleteSpy(id);
            return Promise.resolve({ data: null, error: null });
          },
        }),
      }),
    }),
  },
}));

// ─── Fixtures / helpers ─────────────────────────────────────────────────────

const CLIENT = {
  id: "client-1",
  dob: "1990-01-01",
  has_consented: true,
  consent_signed_name: "Ada Lovelace",
  consented_at: "2026-08-01T00:00:00Z",
};

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

function seed(resources: Resource[], favouriteIds: string[] = []) {
  store.dispatch(fetchPublishedResources.fulfilled(resources, "test", undefined));
  store.dispatch(fetchMyFavourites.fulfilled(favouriteIds, "test", undefined));
}

function renderPage() {
  return render(
    <Provider store={store}>
      <BrowserRouter>
        <ResourcesPage />
      </BrowserRouter>
    </Provider>,
  );
}

beforeEach(() => {
  mockAuth.mockReturnValue({ userProfile: CLIENT });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  store.dispatch(resetStore());
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("ResourcesPage — listing", () => {
  it("renders published resources (happy path)", () => {
    seed([resource({ id: "a", title: "Grounding techniques" }), resource({ id: "b", title: "Sleep hygiene" })]);
    renderPage();

    expect(screen.getByRole("heading", { name: "Grounding techniques" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sleep hygiene" })).toBeInTheDocument();
  });

  it("shows the no-resources empty state when there are none (sad path)", () => {
    seed([]);
    renderPage();

    expect(screen.getByText("No resources available yet.")).toBeInTheDocument();
  });

  it("pinned resources sort ahead of unpinned ones within a tab", () => {
    seed([
      resource({ id: "plain", title: "Plain resource", is_pinned: false }),
      resource({ id: "pinned", title: "Pinned resource", is_pinned: true }),
    ]);
    renderPage();

    const titles = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titles.indexOf("Pinned resource")).toBeLessThan(titles.indexOf("Plain resource"));
  });
});

describe("ResourcesPage — favourites", () => {
  it("favouriting a resource records it against the client (happy path)", async () => {
    seed([resource({ id: "r-1", title: "Grounding techniques" })], []);
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Add to favourites" }));

    await waitFor(() =>
      expect(favInsertSpy).toHaveBeenCalledWith("resource_favourites", {
        user_id: "client-1",
        resource_id: "r-1",
      }),
    );
  });

  it("un-favouriting a resource deletes the row (happy path)", async () => {
    seed([resource({ id: "r-1" })], ["r-1"]);
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Remove from favourites" }));

    await waitFor(() => expect(favDeleteSpy).toHaveBeenCalledWith("r-1"));
  });

  it("the Favourites tab shows only favourited resources", () => {
    seed(
      [resource({ id: "fav", title: "Kept resource" }), resource({ id: "other", title: "Ignored resource" })],
      ["fav"],
    );
    renderPage();

    fireEvent.click(screen.getByRole("tab", { name: "Favourites" }));

    expect(screen.getByRole("heading", { name: "Kept resource" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Ignored resource" })).not.toBeInTheDocument();
  });

  it("the Favourites tab shows a prompt when nothing is favourited (sad path)", () => {
    seed([resource({ id: "r-1" })], []);
    renderPage();

    fireEvent.click(screen.getByRole("tab", { name: "Favourites" }));

    expect(screen.getByText("No favourites yet — tap the star on any resource to save it here.")).toBeInTheDocument();
  });
});

describe("ResourcesPage — signed agreement tab", () => {
  it("shows the 'Your agreement' tab once the client has consented (happy path)", async () => {
    seed([resource({ id: "r-1" })]);
    renderPage();

    fireEvent.click(screen.getByRole("tab", { name: "Your agreement" }));

    expect(await screen.findByText(/Signed by Ada Lovelace/)).toBeInTheDocument();
  });

  it("hides the 'Your agreement' tab when the client has not consented (sad path)", () => {
    mockAuth.mockReturnValue({ userProfile: { ...CLIENT, has_consented: false } });
    seed([resource({ id: "r-1" })]);
    renderPage();

    expect(screen.queryByRole("tab", { name: "Your agreement" })).not.toBeInTheDocument();
  });
});

describe("ResourcesPage — documents tab", () => {
  it("surfaces a Documents tab when the practice has document resources", () => {
    seed([resource({ id: "doc", type: "document", title: "Working agreement", url: "https://x.test/a.pdf" })]);
    renderPage();

    const tab = screen.getByRole("tab", { name: "Documents" });
    fireEvent.click(tab);
    expect(
      within(screen.getByRole("tablist")).getByRole("tab", { name: "Documents", selected: true }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Working agreement" })).toBeInTheDocument();
  });
});
