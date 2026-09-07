import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import OnboardingModal from "./OnboardingModal";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockUseAuth = vi.fn();
vi.mock("../../context/AuthContext", () => ({ useAuth: () => mockUseAuth() }));

// pulls in Supabase storage — not what these tests are about
vi.mock("../shared/UploadAndDisplayImage/UploadAndDisplayImage", () => ({
  default: () => <div data-testid="upload" />,
}));

const updateProfile = vi.fn().mockResolvedValue(undefined);
const baseAuth = {
  userProfile: { id: "u1", first_name: "Ada" },
  updateProfile,
  isAdmin: false,
};

describe("OnboardingModal (client)", () => {
  it("renders step 1 on mount", () => {
    mockUseAuth.mockReturnValue({ ...baseAuth });
    render(<OnboardingModal onComplete={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Welcome, Ada!" })).toBeInTheDocument();
    expect(screen.getByText("Display name")).toBeInTheDocument();
  });

  it("advances to the keywords step on Next", () => {
    mockUseAuth.mockReturnValue({ ...baseAuth });
    render(<OnboardingModal onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Next →" }));
    expect(screen.getByRole("heading", { name: "What would you like to focus on?" })).toBeInTheDocument();
  });

  it("saves the typed display name and calls onComplete (via Skip)", async () => {
    const onComplete = vi.fn();
    mockUseAuth.mockReturnValue({ ...baseAuth });
    render(<OnboardingModal onComplete={onComplete} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Ada L" } });
    fireEvent.click(screen.getByRole("button", { name: "Next →" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip — show me everything" }));

    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ display_name: "Ada L", focus_keywords: null, onboarding_completed: true }),
      ),
    );
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("saves the selected focus keywords via Let's go", async () => {
    const onComplete = vi.fn();
    mockUseAuth.mockReturnValue({ ...baseAuth });
    render(<OnboardingModal onComplete={onComplete} />);

    fireEvent.click(screen.getByRole("button", { name: "Next →" }));
    // "Let's go" is disabled until at least one chip is picked
    const letsGo = screen.getByRole("button", { name: "Let's go" });
    expect(letsGo).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "hope" }));
    fireEvent.click(screen.getByRole("button", { name: "growth" }));
    fireEvent.click(letsGo);

    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ focus_keywords: ["hope", "growth"], onboarding_completed: true }),
      ),
    );
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe("OnboardingModal (admin)", () => {
  it("is a single step — Save writes the profile straight away, no keywords", async () => {
    const onComplete = vi.fn();
    mockUseAuth.mockReturnValue({ ...baseAuth, isAdmin: true });
    render(<OnboardingModal onComplete={onComplete} />);

    expect(screen.queryByRole("button", { name: "Next →" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith(expect.objectContaining({ onboarding_completed: true })),
    );
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
