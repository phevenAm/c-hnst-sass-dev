import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ConsentModal from "./ConsentModal";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockUpdateProfile = vi.fn().mockResolvedValue(undefined);
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ updateProfile: mockUpdateProfile, isDemo: false }),
}));

const mockRpc = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

// PdfViewer's own rendering (real PDF.js canvas output) is covered by live
// browser verification, not unit tests — jsdom can't render canvas/PDF
// content anyway. Stubbed here so this file can focus on ConsentModal's own
// gating logic.
vi.mock("../shared/PdfViewer/PdfViewer", () => ({
  default: ({ title }: { title: string }) => <div data-testid="pdf-viewer">{title}</div>,
}));

const settings = {
  consent_title: "Terms of service",
  consent_body: "Please read carefully.",
  consent_pdf_url: "https://example.com/doc.pdf",
  consent_counsellor_cta: "",
  consent_document_id: null,
};

describe("ConsentModal", () => {
  it("keeps Continue disabled until both the checkbox and printed name are filled", () => {
    render(<ConsentModal settings={settings} onComplete={vi.fn()} />);

    const continueBtn = screen.getByRole("button", { name: "Continue" });
    expect(continueBtn).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(continueBtn).toBeDisabled(); // checked, but no name yet

    fireEvent.change(screen.getByLabelText("Type your full name to sign"), {
      target: { value: "Jane Doe" },
    });
    expect(continueBtn).toBeEnabled();
  });

  it("does not enable Continue from a name alone, without the checkbox", () => {
    render(<ConsentModal settings={settings} onComplete={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Type your full name to sign"), {
      target: { value: "Jane Doe" },
    });
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("saves the trimmed printed name alongside consent, and calls onComplete", async () => {
    const onComplete = vi.fn();
    render(<ConsentModal settings={settings} onComplete={onComplete} />);

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("Type your full name to sign"), {
      target: { value: "  Jane Doe  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await vi.waitFor(() => expect(mockUpdateProfile).toHaveBeenCalled());
    const call = mockUpdateProfile.mock.calls[0][0];
    expect(call.has_consented).toBe(true);
    expect(call.consent_signed_name).toBe("Jane Doe");
    expect(typeof call.consented_at).toBe("string");
    await vi.waitFor(() => expect(onComplete).toHaveBeenCalled());
  });

  it("renders the PDF viewer when a consent PDF is configured", () => {
    render(<ConsentModal settings={settings} onComplete={vi.fn()} />);
    expect(screen.getByTestId("pdf-viewer")).toHaveTextContent("Terms of service");
  });

  it("records a signature via sign_document when the gate is driven by a document", async () => {
    render(<ConsentModal settings={{ ...settings, consent_document_id: "doc-1" }} onComplete={vi.fn()} />);

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("Type your full name to sign"), {
      target: { value: "  Jane Doe  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await vi.waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith("sign_document", {
        p_document_id: "doc-1",
        p_signed_name: "Jane Doe",
      }),
    );
    await vi.waitFor(() => expect(mockUpdateProfile).toHaveBeenCalled());
  });

  it("skips sign_document when there is no consent document (plain-text consent)", async () => {
    render(<ConsentModal settings={settings} onComplete={vi.fn()} />);

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("Type your full name to sign"), {
      target: { value: "Jane Doe" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await vi.waitFor(() => expect(mockUpdateProfile).toHaveBeenCalled());
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
