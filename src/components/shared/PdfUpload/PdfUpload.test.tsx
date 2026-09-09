import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import PdfUpload from "./PdfUpload";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const { storageMock } = vi.hoisted(() => {
  const upload = vi.fn(async () => ({ error: null }));
  const remove = vi.fn(async () => ({ data: [], error: null }));
  const getPublicUrl = vi.fn((path: string) => ({
    data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/documents/${path}` },
  }));
  return { storageMock: { upload, remove, getPublicUrl, from: vi.fn(() => ({ upload, remove, getPublicUrl })) } };
});
vi.mock("@lib/supabase", () => ({ supabase: { storage: storageMock } }));

function pickPdf() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["%PDF-1.4"], "Client Terms.pdf", { type: "application/pdf" });
  fireEvent.change(input, { target: { files: [file] } });
}

const BUCKET_URL = "https://x.supabase.co/storage/v1/object/public/documents";

describe("PdfUpload", () => {
  it("with pathKey, uploads to a fixed path with upsert and returns a cache-busted URL", async () => {
    const onChange = vi.fn();
    render(<PdfUpload adminId="admin-1" pathKey="consent" value="" onChange={onChange} />);

    pickPdf();

    await waitFor(() => expect(storageMock.upload).toHaveBeenCalled());
    const [path, , opts] = storageMock.upload.mock.calls[0];
    expect(path).toBe("admin-1/consent.pdf");
    expect(opts).toMatchObject({ upsert: true, contentType: "application/pdf" });

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.calls[0][0]).toMatch(/\/documents\/admin-1\/consent\.pdf\?v=\d+$/);
  });

  it("without pathKey, uses a unique name and does not upsert", async () => {
    const onChange = vi.fn();
    render(<PdfUpload adminId="admin-1" value="" onChange={onChange} />);

    pickPdf();

    await waitFor(() => expect(storageMock.upload).toHaveBeenCalled());
    const [path, , opts] = storageMock.upload.mock.calls[0];
    expect(path).toMatch(/^admin-1\/[0-9a-f-]{36}-Client_Terms\.pdf$/);
    expect(opts.upsert).toBe(false);
  });

  it("deletes the file it replaces when the new upload lands on a different path", async () => {
    const onChange = vi.fn();
    render(<PdfUpload adminId="admin-1" value={`${BUCKET_URL}/admin-1/old-uuid-Prev.pdf`} onChange={onChange} />);

    pickPdf();

    await waitFor(() => expect(storageMock.remove).toHaveBeenCalledWith(["admin-1/old-uuid-Prev.pdf"]));
  });

  it("does not delete anything when a pathKey upload overwrites the same object", async () => {
    const onChange = vi.fn();
    render(
      <PdfUpload
        adminId="admin-1"
        pathKey="consent"
        value={`${BUCKET_URL}/admin-1/consent.pdf?v=1`}
        onChange={onChange}
      />,
    );

    pickPdf();

    await waitFor(() => expect(storageMock.upload).toHaveBeenCalled());
    expect(storageMock.remove).not.toHaveBeenCalled();
  });

  it("Remove deletes the current file from storage and clears the value", async () => {
    const onChange = vi.fn();
    render(<PdfUpload adminId="admin-1" value={`${BUCKET_URL}/admin-1/consent.pdf`} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(storageMock.remove).toHaveBeenCalledWith(["admin-1/consent.pdf"]));
    expect(onChange).toHaveBeenCalledWith("");
  });
});
