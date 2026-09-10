import { describe, expect, it } from "vitest";

import type { FileFolder } from "@models/files";

import {
  breadcrumbFor,
  formatBytes,
  isAllowedFile,
  isPreviewable,
  isRelPathSafe,
  isSelfOrDescendant,
  isZip,
  mimeForFilename,
} from "./fileTypes";

const folder = (id: string, parent_id: string | null, name: string): FileFolder => ({
  id,
  owner_admin_id: "a",
  agency_id: null,
  parent_id,
  name,
  path: "/",
  depth: 0,
  shared: false,
  created_by: null,
  created_at: "",
  updated_at: "",
});

describe("mimeForFilename", () => {
  it("maps allowed extensions to canonical MIME, case-insensitively", () => {
    expect(mimeForFilename("report.pdf")).toBe("application/pdf");
    expect(mimeForFilename("scan.JPG")).toBe("image/jpeg");
    expect(mimeForFilename("notes.DOCX")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });

  it("returns null for disallowed or extension-less names", () => {
    expect(mimeForFilename("clip.mp4")).toBeNull();
    expect(mimeForFilename("archive.zip")).toBeNull();
    expect(mimeForFilename("payload.exe")).toBeNull();
    expect(mimeForFilename("README")).toBeNull();
  });
});

describe("isAllowedFile / isZip", () => {
  it("accepts allowed files, rejects the rest", () => {
    expect(isAllowedFile({ name: "a.png" })).toBe(true);
    expect(isAllowedFile({ name: "a.mov" })).toBe(false);
  });

  it("detects zips by name or mime", () => {
    expect(isZip({ name: "bundle.zip" })).toBe(true);
    expect(isZip({ name: "bundle", type: "application/x-zip-compressed" })).toBe(true);
    expect(isZip({ name: "bundle.pdf" })).toBe(false);
  });
});

describe("isRelPathSafe", () => {
  it("allows nested POSIX paths", () => {
    expect(isRelPathSafe("2026/q1/report.pdf")).toBe(true);
    expect(isRelPathSafe("report.pdf")).toBe(true);
  });

  it("rejects traversal, absolute, backslash and junk entries", () => {
    expect(isRelPathSafe("../secrets.pdf")).toBe(false);
    expect(isRelPathSafe("/etc/passwd")).toBe(false);
    expect(isRelPathSafe("a\\b.pdf")).toBe(false);
    expect(isRelPathSafe("__MACOSX/._x.pdf")).toBe(false);
    expect(isRelPathSafe("a/./b.pdf")).toBe(false);
    expect(isRelPathSafe("")).toBe(false);
  });
});

describe("formatBytes", () => {
  it("renders human sizes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe("2.5 GB");
  });
});

describe("isPreviewable", () => {
  it("classifies pdf / image / none", () => {
    expect(isPreviewable("application/pdf")).toBe("pdf");
    expect(isPreviewable("image/webp")).toBe("image");
    expect(isPreviewable("application/msword")).toBeNull();
  });
});

describe("breadcrumbFor", () => {
  const folders = [folder("root", null, "Policies"), folder("mid", "root", "2026"), folder("leaf", "mid", "Q1")];

  it("returns the chain from root to the given folder", () => {
    expect(breadcrumbFor("leaf", folders).map((f) => f.name)).toEqual(["Policies", "2026", "Q1"]);
  });

  it("returns [] for the top level", () => {
    expect(breadcrumbFor(null, folders)).toEqual([]);
  });

  it("does not loop on a broken parent chain", () => {
    const cyclic = [folder("x", "y", "X"), folder("y", "x", "Y")];
    expect(breadcrumbFor("x", cyclic).length).toBeLessThanOrEqual(2);
  });
});

describe("isSelfOrDescendant", () => {
  const folders = [folder("a", null, "A"), folder("b", "a", "B"), folder("c", "b", "C"), folder("d", null, "D")];

  it("is true for self and any descendant", () => {
    expect(isSelfOrDescendant("a", "a", folders)).toBe(true);
    expect(isSelfOrDescendant("a", "b", folders)).toBe(true);
    expect(isSelfOrDescendant("a", "c", folders)).toBe(true);
  });

  it("is false for unrelated or ancestor folders", () => {
    expect(isSelfOrDescendant("a", "d", folders)).toBe(false);
    expect(isSelfOrDescendant("b", "a", folders)).toBe(false);
  });
});
