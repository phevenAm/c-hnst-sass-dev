import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EncryptionStatusPill } from "./EncryptionStatusPill";

// Controllable encryption status for each test.
const enc = {
  status: "locked" as "checking" | "disabled" | "locked" | "unlocked",
  pendingCode: null as string | null,
  setupEncryption: vi.fn(async () => {}),
  unlockWithCode: vi.fn(async () => "unlocked" as const),
  clearPendingCode: vi.fn(),
};

vi.mock("@context/EncryptionContext", () => ({
  useEncryption: () => enc,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  enc.status = "locked";
  enc.pendingCode = null;
});

describe("EncryptionStatusPill", () => {
  it("renders nothing while the status is still being checked", () => {
    enc.status = "checking";
    const { container } = render(<EncryptionStatusPill />);
    expect(container).toBeEmptyDOMElement();
  });

  it("is a non-interactive status when unlocked", () => {
    enc.status = "unlocked";
    render(<EncryptionStatusPill />);
    expect(screen.getByText("Encrypted")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("is a button when locked, and clicking it opens the unlock gate", () => {
    enc.status = "locked";
    render(<EncryptionStatusPill />);

    const btn = screen.getByRole("button", { name: /unlock/i });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(btn);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(/4-word encryption code/i);
    expect(screen.getByPlaceholderText(/encryption code/i)).toBeInTheDocument();
  });

  it("is a button when not set up, and clicking it opens the setup gate", () => {
    enc.status = "disabled";
    render(<EncryptionStatusPill />);

    fireEvent.click(screen.getByRole("button", { name: /set up/i }));

    expect(screen.getByRole("button", { name: /enable encryption/i })).toBeInTheDocument();
  });

  it("passes the typed code to unlockWithCode", () => {
    enc.status = "locked";
    render(<EncryptionStatusPill />);
    fireEvent.click(screen.getByRole("button", { name: /unlock/i }));

    fireEvent.change(screen.getByPlaceholderText(/encryption code/i), { target: { value: "calm-reef-gold-pine" } });
    fireEvent.click(screen.getByRole("button", { name: /^unlock notes$/i }));

    expect(enc.unlockWithCode).toHaveBeenCalledWith("calm-reef-gold-pine");
  });
});
