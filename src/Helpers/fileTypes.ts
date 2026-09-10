// Client-side mirror of supabase/functions/_shared/fileTypes.ts. Used for
// instant feedback before a file ever leaves the browser — the edge function
// re-validates everything server-side and is the real gate.
//
// Allowed: PDF, PNG / JPEG / WebP / GIF, Word (.doc / .docx). Nothing else —
// no video, no archives-as-content, no executables.

import type { FileFolder } from "@models/files";

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

export const ALLOWED_EXTS = Object.keys(FILE_EXT_TO_MIME);
export const ALLOWED_MIMES = new Set(Object.values(FILE_EXT_TO_MIME));

/** `accept` attribute for the hidden <input type="file">. */
export const FILE_INPUT_ACCEPT = [".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".doc", ".docx"].join(",");

/** Hard per-file ceiling — mirrors the bucket limit and the DB CHECK. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Canonical MIME for a filename, or null when the extension is not allowed. */
export function mimeForFilename(name: string): string | null {
  const dot = name.lastIndexOf(".");
  const ext = dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
  return FILE_EXT_TO_MIME[ext] ?? null;
}

export function isAllowedFile(file: { name: string }): boolean {
  return mimeForFilename(file.name) !== null;
}

export function isZip(file: { name: string; type?: string }): boolean {
  return (
    file.name.toLowerCase().endsWith(".zip") ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed"
  );
}

/** Reject path-traversal / absolute / separator junk. `rel` is POSIX, relative
 *  to the target folder (e.g. "2026/q1/report.pdf"). */
export function isRelPathSafe(rel: string): boolean {
  if (!rel || rel.length > 1024) return false;
  if (rel.startsWith("/") || rel.includes("\\") || rel.includes("\0")) return false;
  return !rel
    .split("/")
    .some(
      (p) => p === "" || p === "." || p === ".." || p === ".DS_Store" || p === "Thumbs.db" || p.startsWith("__MACOSX"),
    );
}

/** Human-readable byte size: 0 B, 940 KB, 2.4 MB, 1.1 GB. */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const n = bytes / 1024 ** i;
  return `${i === 0 ? n : n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

/** A file is previewable in-app (PDF via <PdfViewer>, images via <img>). Word
 *  docs are download-only. */
export function isPreviewable(mime: string): "pdf" | "image" | null {
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  return null;
}

/** Walk `parent_id` up from `folderId` to the root, returning [root, …, folder]. */
export function breadcrumbFor(folderId: string | null, folders: FileFolder[]): FileFolder[] {
  if (!folderId) return [];
  const byId = new Map(folders.map((f) => [f.id, f]));
  const chain: FileFolder[] = [];
  let cur = byId.get(folderId) ?? null;
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    chain.unshift(cur);
    cur = cur.parent_id ? (byId.get(cur.parent_id) ?? null) : null;
  }
  return chain;
}

/** True when `maybeAncestorId` is `folderId` or sits above it — used to stop the
 *  UI offering an illegal move (the DB cycle guard would reject it anyway). */
export function isSelfOrDescendant(folderId: string, maybeAncestorId: string, folders: FileFolder[]): boolean {
  if (folderId === maybeAncestorId) return true;
  const byId = new Map(folders.map((f) => [f.id, f]));
  let cur = byId.get(maybeAncestorId) ?? null;
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    if (cur.parent_id === folderId) return true;
    guard.add(cur.id);
    cur = cur.parent_id ? (byId.get(cur.parent_id) ?? null) : null;
  }
  return false;
}

export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // strip the "data:<mime>;base64," prefix
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}
