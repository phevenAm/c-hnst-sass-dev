import { describe, expect, it } from "vitest";

import type { PracticeDocument } from "../../../models/globalTypes";
import practiceDocumentsReducer, {
  createPracticeDocument,
  fetchPracticeDocuments,
  reorderPracticeDocuments,
  setSignatureDocument,
} from "../practiceDocumentsSlice";

const initialState = {
  documents: [] as PracticeDocument[],
  mySignatures: [],
  status: "idle" as const,
  error: null,
};

const doc = (id: string, over: Partial<PracticeDocument> = {}): PracticeDocument => ({
  id,
  admin_id: "admin-1",
  title: `Doc ${id}`,
  description: null,
  pdf_url: null,
  requires_signature: false,
  sort_order: 0,
  is_active: true,
  created_at: "2026-08-27T00:00:00Z",
  updated_at: "2026-08-27T00:00:00Z",
  ...over,
});

describe("practiceDocuments reducer", () => {
  it("marks loading on fetch pending and stores rows on fulfilled", () => {
    const loading = practiceDocumentsReducer(initialState, fetchPracticeDocuments.pending("", undefined));
    expect(loading.status).toBe("loading");

    const rows = [doc("a"), doc("b")];
    const done = practiceDocumentsReducer(loading, fetchPracticeDocuments.fulfilled(rows, "", undefined));
    expect(done.status).toBe("succeeded");
    expect(done.documents).toEqual(rows);
  });

  it("records the error on fetch rejected", () => {
    const state = practiceDocumentsReducer(initialState, fetchPracticeDocuments.rejected(null, "", undefined, "boom"));
    expect(state.status).toBe("failed");
    expect(state.error).toBe("boom");
  });

  it("appends a created document", () => {
    const start = { ...initialState, documents: [doc("a")] };
    const next = practiceDocumentsReducer(start, createPracticeDocument.fulfilled(doc("b"), "", { title: "Doc b" }));
    expect(next.documents.map((d) => d.id)).toEqual(["a", "b"]);
  });

  it("keeps at most one requires_signature document", () => {
    const start = {
      ...initialState,
      documents: [doc("a", { requires_signature: true }), doc("b"), doc("c")],
    };
    const next = practiceDocumentsReducer(
      start,
      setSignatureDocument.fulfilled("c", "", { documentId: "c", adminId: "admin-1" }),
    );
    expect(next.documents.filter((d) => d.requires_signature).map((d) => d.id)).toEqual(["c"]);

    const cleared = practiceDocumentsReducer(
      next,
      setSignatureDocument.fulfilled(null, "", { documentId: null, adminId: "admin-1" }),
    );
    expect(cleared.documents.some((d) => d.requires_signature)).toBe(false);
  });

  it("applies a new sort order", () => {
    const start = { ...initialState, documents: [doc("a", { sort_order: 0 }), doc("b", { sort_order: 1 })] };
    const next = practiceDocumentsReducer(
      start,
      reorderPracticeDocuments.fulfilled(
        [
          { id: "b", sort_order: 0 },
          { id: "a", sort_order: 1 },
        ],
        "",
        ["b", "a"],
      ),
    );
    expect(next.documents.map((d) => d.id)).toEqual(["b", "a"]);
  });
});
