// End-to-end coverage for the file manager (/admin/files).
//
// Exercises the real table / RLS / trigger / edge-function layer through an
// unprivileged supabase-js session — folder CRUD, the rename/move path
// re-materialisation, delete cascade + storage reclaim, the whole-batch upload
// reject, and the storage-quota trigger.
//
// NOTE: the upload/zip cases need `file-upload` deployed and migration
// 20260909000400 pushed. Until then those `test()`s fail fast with a clear
// message — the folder/rename/move/quota cases only need the migration.
//
// Cleanup: file_folders cascade to file_objects; both are removed by owner in
// afterAll, then practice_settings + the auth.users row.

import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { readFileSync } from "node:fs";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../settings/constants";
import { createAuthUser, dbQuery } from "../settings/db";

// A real 2-entry archive (readme.pdf + sub\nested.png — Windows Compress-Archive
// writes a backslash separator, which also exercises the edge fn's path
// normalisation). Built once; regenerate with PowerShell Compress-Archive.
const SAMPLE_ZIP_B64 = readFileSync(new URL("fixtures/sample.zip", import.meta.url)).toString("base64");

test.describe.configure({ mode: "serial" });

const TAG = `e2efiles${Date.now()}`;
const PASSWORD = "E2eFilesTest2026!";
const email = `smissah321+${TAG}@gmail.com`;

let adminId: string;
let sb: SupabaseClient;

// A second, unrelated practice — used only by the cross-tenant isolation test.
const emailB = `smissah321+${TAG}-b@gmail.com`;
let adminIdB: string;
let sbB: SupabaseClient;

// tiny valid 1x1 PNG — the edge fn checks the extension, not the bytes
const PNG_1PX_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function uploadDeployed(): Promise<boolean> {
  const { error } = await sb.functions.invoke("file-upload", { body: { mode: "files", folderId: null, items: [] } });
  // A deployed fn answers with an HTTP error (FunctionsHttpError, which carries
  // a Response `context`); a missing one throws FunctionsFetchError with none.
  if (!error) return true;
  return (error as { name?: string }).name === "FunctionsHttpError" || "context" in (error as object);
}

test.beforeAll(async () => {
  adminId = createAuthUser({
    email,
    password: PASSWORD,
    meta: { role: "admin", first_name: "Files", last_name: "Admin" },
  });
  dbQuery(`
    update public.users set onboarding_completed = true where id = '${adminId}';
    insert into public.practice_settings (admin_id, subscription_status, subscription_plan, onboarding_required)
      values ('${adminId}', 'active', 'starter', false)
      on conflict (admin_id) do update set subscription_status = 'active', subscription_plan = 'starter', onboarding_required = false;
  `);
  adminIdB = createAuthUser({
    email: emailB,
    password: PASSWORD,
    meta: { role: "admin", first_name: "Files", last_name: "AdminB" },
  });
  dbQuery(`
    update public.users set onboarding_completed = true where id = '${adminIdB}';
    insert into public.practice_settings (admin_id, subscription_status, subscription_plan, onboarding_required)
      values ('${adminIdB}', 'active', 'starter', false)
      on conflict (admin_id) do update set subscription_status = 'active';
  `);

  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  sbB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const [{ error: eA }, { error: eB }] = await Promise.all([
    sb.auth.signInWithPassword({ email, password: PASSWORD }),
    sbB.auth.signInWithPassword({ email: emailB, password: PASSWORD }),
  ]);
  if (eA || eB) throw new Error(`sign-in failed: ${eA?.message ?? eB?.message}`);
});

test.afterAll(() => {
  for (const id of [adminId, adminIdB]) {
    dbQuery(`
      delete from public.file_objects where owner_admin_id = '${id}';
      delete from public.file_folders where owner_admin_id = '${id}';
      delete from public.file_deletion_queue where storage_path like 'u/${id}/%';
      delete from public.practice_settings where admin_id = '${id}';
      delete from public.users where id = '${id}';
      delete from auth.users where id = '${id}';
    `);
  }
});

test("creates nested folders and blocks a duplicate sibling name", async () => {
  const { data: root, error: e1 } = await sb
    .from("file_folders")
    .insert({ parent_id: null, name: "Policies" })
    .select()
    .single();
  expect(e1).toBeNull();
  expect(root.path).toBe("/Policies");
  expect(root.depth).toBe(0);

  const { data: sub, error: e2 } = await sb
    .from("file_folders")
    .insert({ parent_id: root.id, name: "2026" })
    .select()
    .single();
  expect(e2).toBeNull();
  expect(sub.path).toBe("/Policies/2026");
  expect(sub.depth).toBe(1);

  const dup = await sb.from("file_folders").insert({ parent_id: null, name: "Policies" });
  expect(dup.error).not.toBeNull(); // sibling-unique index
});

test("renaming a folder re-materialises the whole subtree, leaving files' storage keys intact", async () => {
  const { data: a } = await sb.from("file_folders").insert({ parent_id: null, name: "Alpha" }).select().single();
  const { data: b } = await sb.from("file_folders").insert({ parent_id: a.id, name: "Beta" }).select().single();

  // seed a file row directly (upload path is covered separately)
  dbQuery(`
    insert into public.file_objects (owner_admin_id, folder_id, storage_path, name, mime_type, size_bytes)
    values ('${adminId}', '${b.id}', 'u/${adminId}/${TAG}-keep', 'keep.pdf', 'application/pdf', 100);
  `);

  const { error } = await sb.from("file_folders").update({ name: "AlphaRenamed" }).eq("id", a.id);
  expect(error).toBeNull();

  const { data: refreshed } = await sb.from("file_folders").select("*").in("id", [a.id, b.id]);
  const byId = Object.fromEntries((refreshed ?? []).map((f) => [f.id, f]));
  expect(byId[a.id].path).toBe("/AlphaRenamed");
  expect(byId[b.id].path).toBe("/AlphaRenamed/Beta"); // cascaded

  const { data: file } = await sb.from("file_objects").select("storage_path").eq("folder_id", b.id).single();
  expect(file.storage_path).toBe(`u/${adminId}/${TAG}-keep`); // link unbroken
});

test("moving a folder into its own descendant is rejected", async () => {
  const { data: p } = await sb.from("file_folders").insert({ parent_id: null, name: "Parent" }).select().single();
  const { data: c } = await sb.from("file_folders").insert({ parent_id: p.id, name: "Child" }).select().single();

  const bad = await sb.from("file_folders").update({ parent_id: c.id }).eq("id", p.id);
  expect(bad.error?.message ?? "").toMatch(/FOLDER_CYCLE/);

  // a legal move still works and updates the path
  const { data: dest } = await sb.from("file_folders").insert({ parent_id: null, name: "Dest" }).select().single();
  const ok = await sb.from("file_folders").update({ parent_id: dest.id }).eq("id", p.id);
  expect(ok.error).toBeNull();
  const { data: moved } = await sb.from("file_folders").select("path").eq("id", c.id).single();
  expect(moved.path).toBe("/Dest/Parent/Child");
});

test("deleting a folder cascades rows and queues the blobs, freeing quota", async () => {
  const { data: f } = await sb.from("file_folders").insert({ parent_id: null, name: "Doomed" }).select().single();
  dbQuery(`
    insert into public.file_objects (owner_admin_id, folder_id, storage_path, name, mime_type, size_bytes)
    values ('${adminId}', '${f.id}', 'u/${adminId}/${TAG}-doomed', 'x.pdf', 'application/pdf', 4096);
  `);

  const before = (await sb.rpc("file_storage_report")).data as { used_bytes: number };
  const { error } = await sb.from("file_folders").delete().eq("id", f.id);
  expect(error).toBeNull();

  const { data: gone } = await sb.from("file_objects").select("id").eq("storage_path", `u/${adminId}/${TAG}-doomed`);
  expect(gone).toEqual([]);
  const after = (await sb.rpc("file_storage_report")).data as { used_bytes: number };
  expect(after.used_bytes).toBe(before.used_bytes - 4096);

  const queued = dbQuery<{ n: string }>(
    `select count(*)::text as n from public.file_deletion_queue where storage_path = 'u/${adminId}/${TAG}-doomed';`,
  ).rows[0].n;
  expect(queued).toBe("1");
});

test("the storage-quota trigger blocks an over-cap insert", () => {
  // starter cap = 2.5 GiB; a 3 GB file must be refused by file_enforce_quota.
  let threw = "";
  try {
    dbQuery(`
      insert into public.file_objects (owner_admin_id, folder_id, storage_path, name, mime_type, size_bytes)
      values ('${adminId}', null, 'u/${adminId}/${TAG}-huge', 'huge.pdf', 'application/pdf', 26214400);
    `);
    // 25 MiB fits; now push far over with a second, giant row
    dbQuery(`
      insert into public.file_objects (owner_admin_id, folder_id, storage_path, name, mime_type, size_bytes)
      values ('${adminId}', null, 'u/${adminId}/${TAG}-huge2', 'huge2.pdf', 'application/pdf', 3000000000);
    `);
  } catch (e) {
    threw = String(e);
  }
  expect(threw).toMatch(/STORAGE_QUOTA_EXCEEDED|size_bytes/);
});

test("upload: a folder of allowed files lands, a batch with a video is rejected whole", async () => {
  test.skip(!(await uploadDeployed()), "file-upload edge function not deployed yet");

  const { data: dest } = await sb.from("file_folders").insert({ parent_id: null, name: "Uploads" }).select().single();

  const ok = await sb.functions.invoke("file-upload", {
    body: {
      mode: "files",
      folderId: dest.id,
      items: [
        { path: "brochure.pdf", dataBase64: PNG_1PX_B64 },
        { path: "images/logo.png", dataBase64: PNG_1PX_B64 },
      ],
    },
  });
  expect(ok.error).toBeNull();
  expect((ok.data as { created: unknown[] }).created).toHaveLength(2);

  const rejected = await sb.functions.invoke("file-upload", {
    body: { mode: "files", folderId: dest.id, items: [{ path: "clip.mp4", dataBase64: PNG_1PX_B64 }] },
  });
  expect(rejected.error).not.toBeNull(); // 422 UPLOAD_REJECTED — nothing imported

  const { data: still } = await sb.from("file_objects").select("name").eq("folder_id", dest.id);
  expect((still ?? []).map((r) => r.name).sort()).toEqual(["brochure.pdf"]); // logo.png is one level down
});

test("upload: a zip is expanded into a nested folder tree", async () => {
  test.skip(!(await uploadDeployed()), "file-upload edge function not deployed yet");

  const { data: dest } = await sb.from("file_folders").insert({ parent_id: null, name: "FromZip" }).select().single();
  const res = await sb.functions.invoke("file-upload", {
    body: { mode: "zip", folderId: dest.id, zipBase64: SAMPLE_ZIP_B64 },
  });
  expect(res.error).toBeNull();

  const { data: subFolder } = await sb
    .from("file_folders")
    .select("id, path")
    .eq("parent_id", dest.id)
    .eq("name", "sub")
    .single();
  expect(subFolder.path).toBe("/FromZip/sub");
  const { data: nested } = await sb.from("file_objects").select("name").eq("folder_id", subFolder.id);
  expect((nested ?? []).map((r) => r.name)).toEqual(["nested.png"]);
});

test("cross-tenant isolation: admin B cannot see, touch, or profile admin A's files", async () => {
  // A owns a folder + a file row + a storage key.
  const { data: folderA } = await sb
    .from("file_folders")
    .insert({ parent_id: null, name: "PrivateA" })
    .select()
    .single();
  const objPath = `u/${adminId}/${TAG}-xtenant`;
  dbQuery(`
    insert into public.file_objects (owner_admin_id, folder_id, storage_path, name, mime_type, size_bytes)
    values ('${adminId}', '${folderA.id}', '${objPath}', 'secret.pdf', 'application/pdf', 900);
  `);
  const { data: objA } = await sb.from("file_objects").select("id").eq("storage_path", objPath).single();

  // ── Reads: B sees nothing of A's ──────────────────────────────────────
  expect((await sbB.from("file_folders").select("id").eq("id", folderA.id)).data).toEqual([]);
  expect((await sbB.from("file_objects").select("id").eq("id", objA.id)).data).toEqual([]);
  // and B's whole-tree fetch never includes A
  const bTree = (await sbB.from("file_folders").select("owner_admin_id")).data ?? [];
  expect(bTree.every((r) => r.owner_admin_id !== adminId)).toBe(true);

  // ── Writes: RLS lets none of these affect A's rows ────────────────────
  await sbB.from("file_folders").update({ name: "hijacked" }).eq("id", folderA.id);
  await sbB.from("file_objects").update({ name: "hijacked" }).eq("id", objA.id);
  await sbB.from("file_folders").delete().eq("id", folderA.id);
  await sbB.from("file_objects").delete().eq("id", objA.id);
  const check = dbQuery<{ folder_name: string; object_name: string }>(`
    select (select name from public.file_folders where id = '${folderA.id}') as folder_name,
           (select name from public.file_objects  where id = '${objA.id}')   as object_name;
  `).rows[0];
  expect(check.folder_name).toBe("PrivateA"); // untouched
  expect(check.object_name).toBe("secret.pdf"); // untouched

  // ── Storage: B can't sign a URL for A's blob ──────────────────────────
  const signed = await sbB.storage.from("practice-files").createSignedUrl(objPath, 60);
  expect(signed.error).not.toBeNull();
  expect(signed.data?.signedUrl).toBeFalsy();

  // ── Quota functions: B can't profile A's usage / plan (20260910100000) ─
  const usedErr = (await sbB.rpc("file_storage_used", { p_admin: adminId })).error;
  const quotaErr = (await sbB.rpc("file_storage_quota", { p_admin: adminId })).error;
  expect(usedErr?.message ?? "").toMatch(/NOT_AUTHORIZED/);
  expect(quotaErr?.message ?? "").toMatch(/NOT_AUTHORIZED/);
  // ...but each admin can still read their own
  expect((await sb.rpc("file_storage_report")).error).toBeNull();
  expect((await sbB.rpc("file_storage_report")).error).toBeNull();

  // ── Folder column guard (20260910100000): A can't repoint ownership ───
  const guard = await sb.from("file_folders").update({ owner_admin_id: adminIdB }).eq("id", folderA.id);
  expect(guard.error?.message ?? "").toMatch(/FOLDER_IMMUTABLE_COLUMN/);
});
