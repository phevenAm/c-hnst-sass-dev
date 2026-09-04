import { MemoryRouter } from "react-router-dom";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SuperAdminPage from "./SuperAdminPage";

// The header's "Test coverage" link needs a Router context.
function renderPage() {
  return render(
    <MemoryRouter>
      <SuperAdminPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("@context/AuthContext", () => ({
  useAuth: () => ({ signOut: vi.fn() }),
}));

const activePractice = {
  id: "practice-1",
  admin_id: "admin-1",
  business_name: "Calm Counselling",
  subscription_status: "active",
  subscription_plan: "app",
  stripe_subscription_id: "sub_1",
  billing_customer_id: "cus_1",
  is_paused: false,
  paused_reason: null,
  updated_at: "2026-08-01T00:00:00.000Z",
  users: {
    first_name: "Amanda",
    last_name: "Rowe",
    email: "amanda@example.com",
    created_at: "2026-01-01T00:00:00.000Z",
    disabled: false,
  },
};

const pausedPractice = {
  ...activePractice,
  id: "practice-2",
  admin_id: "admin-2",
  business_name: "Paused Practice",
  is_paused: true,
  paused_reason: "Chargeback dispute",
};

const invokeSpy = vi.fn();

beforeEach(() => {
  invokeSpy.mockReset();
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeSpy(...args) },
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: [] }),
      }),
    }),
  },
}));

describe("SuperAdminPage — pausing a practice", () => {
  it("shows a Pause button for an active practice and confirms with a reason (happy path)", async () => {
    invokeSpy.mockImplementation((fnName: string) => {
      if (fnName === "get-all-practices")
        return Promise.resolve({ data: { practices: [activePractice] }, error: null });
      if (fnName === "superadmin-set-practice-paused") return Promise.resolve({ data: { success: true }, error: null });
      return Promise.resolve({ data: null, error: null });
    });

    renderPage();

    const pauseBtn = await screen.findByRole("button", { name: /pause/i });
    fireEvent.click(pauseBtn);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/read-only for the admin and every client/i)).toBeInTheDocument();

    const reasonInput = within(dialog).getByPlaceholderText(/reason/i);
    fireEvent.change(reasonInput, { target: { value: "Late on payment" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /pause practice/i }));

    await waitFor(() =>
      expect(invokeSpy).toHaveBeenCalledWith("superadmin-set-practice-paused", {
        body: { admin_id: "admin-1", paused: true, reason: "Late on payment" },
      }),
    );
  });

  it("shows a Resume button and a Paused badge for a paused practice (happy path)", async () => {
    invokeSpy.mockImplementation((fnName: string) => {
      if (fnName === "get-all-practices")
        return Promise.resolve({ data: { practices: [pausedPractice] }, error: null });
      if (fnName === "superadmin-set-practice-paused") return Promise.resolve({ data: { success: true }, error: null });
      return Promise.resolve({ data: null, error: null });
    });

    renderPage();

    expect(await screen.findByText("Paused")).toBeInTheDocument();
    const resumeBtn = screen.getByRole("button", { name: /resume/i });
    fireEvent.click(resumeBtn);

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /resume practice/i }));

    await waitFor(() =>
      expect(invokeSpy).toHaveBeenCalledWith("superadmin-set-practice-paused", {
        body: { admin_id: "admin-2", paused: false, reason: null },
      }),
    );
  });

  it("surfaces an error and leaves the practice unpaused if the edge function fails (sad path)", async () => {
    invokeSpy.mockImplementation((fnName: string) => {
      if (fnName === "get-all-practices")
        return Promise.resolve({ data: { practices: [activePractice] }, error: null });
      if (fnName === "superadmin-set-practice-paused")
        return Promise.resolve({ data: null, error: { message: "Stripe unreachable" } });
      return Promise.resolve({ data: null, error: null });
    });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /pause/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /pause practice/i }));

    expect(await screen.findByText(/stripe unreachable/i)).toBeInTheDocument();
    // Dialog stays open — nothing silently succeeded.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
