/**
 * AdminStubDetailPage — hero display-name tests.
 *
 * Focused regression coverage for a real bug: the hero's displayName was
 * computed inline as `stub.codename || realName`, never checking the
 * practice-wide use_client_codenames toggle at all — unlike real clients,
 * which go through clientDisplayName() and correctly gate on it. That meant
 * an offline client with a codename showed it (and the real name as a
 * subtitle) regardless of whether codenames were switched on, and someone
 * with codenames off but a stub that happened to have one set would still
 * see the codename as their primary name.
 *
 * Not a full test suite for this page — mocks are scoped to what the hero
 * needs (a stub in the store) plus enough to keep every other effect on
 * this page from throwing.
 */
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { configureStore } from "@reduxjs/toolkit";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import clientStubsReducer from "@store/slices/clientStubsSlice";
import questionnairesReducer from "@store/slices/questionnairesSlice";
import userDirectoryReducer from "@store/slices/userDirectorySlice";

import type { ClientStub } from "@/models/globalTypes";
import AdminStubDetailPage from "./AdminStubDetailPage";

const STUB_ID = "stub-1";

afterEach(cleanup);

const mockUseAuth = vi.fn();
vi.mock("@context/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@context/ToastContext", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

// Every supabase call this page makes beyond the preloaded stub resolves to
// "nothing" — sessions, notes, forms, reminder mutes. None of that affects
// the hero name.
const emptyChain = (): Record<string, unknown> => {
  const result = Promise.resolve({ data: null, error: null });
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    insert: () => chain,
    delete: () => chain,
    update: () => chain,
    single: () => result,
    maybeSingle: () => result,
    // biome-ignore lint/suspicious/noThenProperty: intentional — mimics supabase-js's thenable query builder
    then: (res: (v: unknown) => unknown) => result.then(res),
  };
  return chain;
};

vi.mock("@lib/supabase", () => ({
  supabase: {
    from: () => emptyChain(),
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}));

vi.mock("@store/slices/clientStubsSlice", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@store/slices/clientStubsSlice")>();
  return { ...mod, fetchClientStubs: () => () => Promise.resolve() };
});
vi.mock("@store/slices/userDirectorySlice", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@store/slices/userDirectorySlice")>();
  return { ...mod, fetchAllUsers: () => () => Promise.resolve() };
});
vi.mock("@store/slices/questionnairesSlice", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@store/slices/questionnairesSlice")>();
  return { ...mod, fetchQuestionnaires: () => () => Promise.resolve() };
});

vi.mock("@Hooks/useRealtimeTable", () => ({ useRealtimeTable: () => {} }));

// Heavy modals never opened by these tests — stub them out so their own
// imports/effects can't interfere.
vi.mock("../AdminClientsPage/modals/CreateStubModal/CreateStubModal", () => ({ default: () => null }));
vi.mock("./InviteStubModal", () => ({ default: () => null }));
vi.mock("@components/shared/SessionCard/CreateSessionModal/CreateSessionModal", () => ({ default: () => null }));

const mockStub: ClientStub = {
  id: STUB_ID,
  created_by: "admin-1",
  linked_user_id: null,
  first_name: "Robert",
  last_name: "Ainsley",
  email: null,
  codename: "Client R.A.",
  created_at: new Date().toISOString(),
};

function renderPage(useClientCodenames: boolean) {
  mockUseAuth.mockReturnValue({
    userProfile: { id: "admin-1" },
    isDemo: false,
    practiceSettings: { use_client_codenames: useClientCodenames },
  });

  const store = configureStore({
    reducer: {
      clientStubs: clientStubsReducer,
      userDirectory: userDirectoryReducer,
      questionnaires: questionnairesReducer,
    },
    preloadedState: {
      clientStubs: { stubs: [mockStub], status: "succeeded", error: null },
      userDirectory: { users: [], status: "succeeded", error: null },
      questionnaires: { questionnaires: [], status: "succeeded", error: null },
    },
  });

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/admin/clients/stub/${STUB_ID}`]}>
        <Routes>
          <Route path="/admin/clients/stub/:stubId" element={<AdminStubDetailPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

describe("AdminStubDetailPage — hero display name vs. use_client_codenames", () => {
  it("shows the codename (and real name as a subtitle) when codenames are on", async () => {
    renderPage(true);

    expect(await screen.findByRole("heading", { level: 1, name: "Client R.A." })).toBeInTheDocument();
    expect(screen.getByText("Robert Ainsley")).toBeInTheDocument();
  });

  it("shows the real name only — no codename, no subtitle — when codenames are off", async () => {
    renderPage(false);

    expect(await screen.findByRole("heading", { level: 1, name: "Robert Ainsley" })).toBeInTheDocument();
    expect(screen.queryByText("Client R.A.")).not.toBeInTheDocument();
  });
});
