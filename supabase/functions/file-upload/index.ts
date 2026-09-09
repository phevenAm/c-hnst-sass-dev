import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { decodeBase64 } from "jsr:@std/encoding@1/base64";
import { createClient } from "npm:@supabase/supabase-js@2";
import JSZip from "npm:jszip@3.10.1";
import { isRelPathSafe, MAX_FILE_BYTES, mimeForFilename, splitRelPath } from "../_shared/fileTypes.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

// Whole-batch request ceiling. Edge functions cap the body well above this; the
// limit here is about keeping a single call fast and the rollback path small.
// The FE splits large folder uploads into several "files" calls.
const MAX_BATCH_BYTES = 20 * 1024 * 1024;
const MAX_BATCH_FILES = 200;

type Incoming = { relPath: string; bytes: Uint8Array; mime: string };

function bad(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // ── Auth ────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return bad(401, { error: "Unauthorized" });
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (authError || !user) return bad(401, { error: "Unauthorized" });

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return bad(403, { error: "Forbidden — admins only" });

  // ── Parse ───────────────────────────────────────────────────────────────
  let body: {
    mode?: "files" | "zip";
    folderId?: string | null;
    items?: { path: string; dataBase64: string }[];
    zipBase64?: string;
  };
  try {
    body = await req.json();
  } catch {
    return bad(400, { error: "Invalid JSON body" });
  }
  const mode = body.mode ?? "files";
  const folderId = body.folderId ?? null;

  // Target folder must belong to the caller (v1: you upload into your own tree).
  if (folderId) {
    const { data: folder } = await supabase
      .from("file_folders")
      .select("id, owner_admin_id")
      .eq("id", folderId)
      .maybeSingle();
    if (!folder) return bad(404, { error: "Target folder not found" });
    if (folder.owner_admin_id !== user.id) return bad(403, { error: "Target folder is not yours" });
  }

  // ── Collect entries (files | zip) ──────────────────────────────────────
  const entries: Incoming[] = [];
  const rejected: { path: string; reason: string }[] = [];

  if (mode === "zip") {
    if (!body.zipBase64) return bad(400, { error: "zipBase64 required for mode 'zip'" });
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(decodeBase64(body.zipBase64));
    } catch {
      return bad(400, { error: "Could not read the archive" });
    }
    for (const entry of Object.values(zip.files) as JSZip.JSZipObject[]) {
      if (entry.dir) continue;
      const rel = entry.name.replace(/\\/g, "/");
      if (!isRelPathSafe(rel)) {
        rejected.push({ path: entry.name, reason: "unsafe path" });
        continue;
      }
      const mime = mimeForFilename(rel);
      if (!mime) {
        rejected.push({ path: rel, reason: "file type not allowed" });
        continue;
      }
      const bytes = await entry.async("uint8array");
      if (bytes.length > MAX_FILE_BYTES) {
        rejected.push({ path: rel, reason: "file exceeds 25 MB" });
        continue;
      }
      entries.push({ relPath: rel, bytes, mime });
    }
  } else {
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return bad(400, { error: "items[] required for mode 'files'" });
    }
    for (const item of body.items) {
      const rel = String(item.path ?? "").replace(/\\/g, "/");
      if (!isRelPathSafe(rel)) {
        rejected.push({ path: item.path, reason: "unsafe path" });
        continue;
      }
      const mime = mimeForFilename(rel);
      if (!mime) {
        rejected.push({ path: rel, reason: "file type not allowed" });
        continue;
      }
      let bytes: Uint8Array;
      try {
        bytes = decodeBase64(item.dataBase64);
      } catch {
        rejected.push({ path: rel, reason: "unreadable data" });
        continue;
      }
      if (bytes.length > MAX_FILE_BYTES) {
        rejected.push({ path: rel, reason: "file exceeds 25 MB" });
        continue;
      }
      entries.push({ relPath: rel, bytes, mime });
    }
  }

  // Decision: any disallowed / unsafe entry rejects the WHOLE upload.
  if (rejected.length > 0) {
    return bad(422, {
      error: "UPLOAD_REJECTED",
      message: "The upload contains files that can't be stored. Nothing was imported.",
      rejected,
    });
  }
  if (entries.length === 0) return bad(400, { error: "No files in the upload" });
  if (entries.length > MAX_BATCH_FILES) {
    return bad(413, { error: `Too many files in one call (max ${MAX_BATCH_FILES}). Split the upload.` });
  }

  const batchBytes = entries.reduce((n, e) => n + e.bytes.length, 0);
  if (batchBytes > MAX_BATCH_BYTES) {
    return bad(413, { error: `Upload too large for one call (max ${MAX_BATCH_BYTES} bytes). Split the upload.` });
  }

  // ── Quota preflight ───────────────────────────────────────────────────
  const [{ data: used }, { data: quota }] = await Promise.all([
    supabase.rpc("file_storage_used", { p_admin: user.id }),
    supabase.rpc("file_storage_quota", { p_admin: user.id }),
  ]);
  const usedBytes = Number(used ?? 0);
  const quotaBytes = Number(quota ?? 0);
  if (usedBytes + batchBytes > quotaBytes) {
    return bad(413, {
      error: "STORAGE_QUOTA_EXCEEDED",
      message: "This upload would exceed your storage limit. Nothing was imported.",
      usedBytes,
      quotaBytes,
      batchBytes,
    });
  }

  // Storage-key prefix: agency pool when the uploader is an active member.
  const { data: membership } = await supabase
    .from("agency_members")
    .select("agency_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  const prefix = membership?.agency_id ? `a/${membership.agency_id}` : `u/${user.id}`;

  // ── mkdir -p ─────────────────────────────────────────────────────────
  // Cache folder ids by their path relative to the target folder ("" = target).
  const folderCache = new Map<string, string | null>([["", folderId]]);
  let foldersCreated = 0;

  async function ensureFolder(dirs: string[]): Promise<string | null> {
    let key = "";
    let parentId = folderId;
    for (const name of dirs) {
      const nextKey = key ? `${key}/${name}` : name;
      if (folderCache.has(nextKey)) {
        parentId = folderCache.get(nextKey)!;
        key = nextKey;
        continue;
      }
      // create, tolerating a concurrent create (sibling-unique index)
      const { data: made, error: insErr } = await supabase
        .from("file_folders")
        .insert({ owner_admin_id: user.id, parent_id: parentId, name, created_by: user.id })
        .select("id")
        .single();
      let id: string;
      if (insErr) {
        // Lost a race (sibling-unique index) or a real failure — re-select the
        // sibling by (owner, parent, name). btrim happens in the DB trigger, so
        // match on the trimmed name we'd have stored.
        let q = supabase.from("file_folders").select("id").eq("owner_admin_id", user.id).eq("name", name.trim());
        q = parentId === null ? q.is("parent_id", null) : q.eq("parent_id", parentId);
        const { data: found } = await q.maybeSingle();
        if (!found) throw new Error(`Could not create folder "${name}": ${insErr.message}`);
        id = found.id;
      } else {
        id = made.id;
        foldersCreated++;
      }
      folderCache.set(nextKey, id);
      parentId = id;
      key = nextKey;
    }
    return parentId;
  }

  // ── Upload + insert, with best-effort rollback ────────────────────────
  const uploadedPaths: string[] = [];
  const insertedIds: string[] = [];
  const created: { id: string; name: string; folderId: string | null; sizeBytes: number }[] = [];

  try {
    for (const entry of entries) {
      const { dirs, filename } = splitRelPath(entry.relPath);
      const targetFolder = await ensureFolder(dirs);

      const fileId = crypto.randomUUID();
      const storagePath = `${prefix}/${fileId}`;

      const up = await supabase.storage
        .from("practice-files")
        .upload(storagePath, entry.bytes, { contentType: entry.mime, upsert: false });
      if (up.error) throw new Error(`storage upload failed for ${filename}: ${up.error.message}`);
      uploadedPaths.push(storagePath);

      const { data: row, error: rowErr } = await supabase
        .from("file_objects")
        .insert({
          owner_admin_id: user.id,
          folder_id: targetFolder,
          storage_path: storagePath,
          name: filename,
          mime_type: entry.mime,
          size_bytes: entry.bytes.length,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (rowErr) {
        // quota backstop trigger or the name-unique index
        const code = rowErr.message.startsWith("STORAGE_QUOTA_EXCEEDED")
          ? "STORAGE_QUOTA_EXCEEDED"
          : "ROW_INSERT_FAILED";
        throw Object.assign(new Error(rowErr.message), { code, filename });
      }
      insertedIds.push(row.id);
      created.push({ id: row.id, name: filename, folderId: targetFolder, sizeBytes: entry.bytes.length });
    }
  } catch (err) {
    // roll back this batch: rows first (trigger queues the blobs), then blobs now
    if (insertedIds.length) await supabase.from("file_objects").delete().in("id", insertedIds);
    if (uploadedPaths.length) await supabase.storage.from("practice-files").remove(uploadedPaths);
    const e = err as { message: string; code?: string };
    return bad(e.code === "STORAGE_QUOTA_EXCEEDED" ? 413 : 500, {
      error: e.code ?? "UPLOAD_FAILED",
      message: e.message,
    });
  }

  return new Response(JSON.stringify({ ok: true, created, foldersCreated }), { headers: corsHeaders });
});
