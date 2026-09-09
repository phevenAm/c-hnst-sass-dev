import { describe, expect, it } from "vitest";

import { storagePathForBucket } from "./PdfUpload";

const base = "https://x.supabase.co/storage/v1/object/public";

describe("storagePathForBucket", () => {
  it("extracts the object path for a URL in the given bucket", () => {
    expect(storagePathForBucket(`${base}/documents/admin-1/consent.pdf`, "documents")).toBe("admin-1/consent.pdf");
    expect(storagePathForBucket(`${base}/documents/admin-1/9f2-scan.pdf`, "documents")).toBe("admin-1/9f2-scan.pdf");
  });

  it("drops a cache-busting query string", () => {
    expect(storagePathForBucket(`${base}/documents/admin-1/consent.pdf?v=1736200000000`, "documents")).toBe(
      "admin-1/consent.pdf",
    );
  });

  it("decodes percent-encoded segments", () => {
    expect(storagePathForBucket(`${base}/documents/admin-1/my%20terms.pdf`, "documents")).toBe("admin-1/my terms.pdf");
  });

  it("returns null when the URL isn't in this bucket", () => {
    expect(storagePathForBucket(`${base}/avatars/admin-1/x.jpg`, "documents")).toBeNull();
    expect(storagePathForBucket("https://example.com/some/external/terms.pdf", "documents")).toBeNull();
    expect(storagePathForBucket("", "documents")).toBeNull();
  });
});
