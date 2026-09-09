// Canonical allowlist for the file manager. The edge function trusts the file
// EXTENSION, not the browser-supplied MIME type, and maps it here. Keep this in
// sync with:
//   * the `file_objects_mime_ok` CHECK in 20260909000400_file_manager.sql
//   * src/Helpers/fileTypes.ts (the FE mirror used for client-side pre-checks)
//
// Allowed: PDF, PNG / JPEG / WebP / GIF, Word (.doc / .docx). Nothing else.

export const FILE_EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export const ALLOWED_MIMES: ReadonlySet<string> = new Set(Object.values(FILE_EXT_TO_MIME));

/** Hard per-file ceiling — mirrors the bucket's file_size_limit and the
 *  file_objects_size_rng CHECK. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Canonical MIME for a filename, or null when the extension is not allowed. */
export function mimeForFilename(name: string): string | null {
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return FILE_EXT_TO_MIME[ext] ?? null;
}

/** Reject path-traversal, absolute paths, Windows separators, and the junk
 *  macOS / Windows put inside zips. `rel` is a POSIX path relative to the
 *  target folder (e.g. "2026/q1/report.pdf"). */
export function isRelPathSafe(rel: string): boolean {
  if (!rel || rel.length > 1024) return false;
  if (rel.startsWith("/") || rel.includes("\\") || rel.includes("\0")) return false;
  const parts = rel.split("/");
  return !parts.some(
    (p) => p === "" || p === "." || p === ".." || p === ".DS_Store" || p === "Thumbs.db" || p.startsWith("__MACOSX"),
  );
}

/** Split "2026/q1/report.pdf" -> { dirs: ["2026","q1"], filename: "report.pdf" }. */
export function splitRelPath(rel: string): { dirs: string[]; filename: string } {
  const parts = rel.split("/").filter(Boolean);
  const filename = parts.pop() ?? "";
  return { dirs: parts, filename };
}
