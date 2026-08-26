-- Two real issues found while auditing storage policies after the
-- documents-bucket listing leak fix (20260826000007):
--
-- 1. 'avatars' had leftover dashboard-created policies (avatar_insert,
--    avatar_select, avatar_update — all just `bucket_id = 'avatars'`, no
--    ownership check) sitting *alongside* the correctly owner-scoped ones
--    from 20260817000004 (avatars user insert/update/delete). Postgres RLS
--    policies are OR'd together, so the unscoped ones made the scoped ones
--    meaningless: any authenticated user could overwrite or replace any
--    other user's avatar, not just view/list them. This is worse than the
--    documents listing leak — it's a write vulnerability, not just a read
--    one.
--
-- 2. 'logos' has the equivalent problem on write: "admins can upload logos"
--    / "admins can delete logos" only check `role = 'admin'`, not whether
--    the file belongs to that admin's own practice — so any admin could
--    overwrite or delete a different practice's logo. Same fix pattern as
--    avatars: scope by the uploader's own uid, matching the {admin_id}.jpg
--    path convention UploadAndDisplayImage already writes (see
--    src/components/shared/UploadAndDisplayImage). No UPDATE policy existed
--    at all for logos, which upload-with-upsert needs when replacing an
--    existing logo — added one to match.
--
-- Neither bucket needs a SELECT/list policy on storage.objects at all: both
-- are public buckets (public = true), and Supabase serves a known object's
-- exact URL unconditionally via /storage/v1/object/public/... regardless of
-- storage.objects RLS — confirmed with the same live test used for the
-- documents bucket fix. Dropping every read policy here removes the
-- anonymous-listing capability (flagged by the linter as
-- public_bucket_allows_listing for both buckets) without touching how
-- avatars/logos are actually displayed.

-- ── avatars ──
drop policy if exists "avatar_insert" on storage.objects;
drop policy if exists "avatar_select" on storage.objects;
drop policy if exists "avatar_update" on storage.objects;
drop policy if exists "avatars public read" on storage.objects;

-- ── logos ──
drop policy if exists "anyone can view logos" on storage.objects;

drop policy if exists "admins can upload logos" on storage.objects;
create policy "admins can upload logos"
  on storage.objects for insert
  with check (
    bucket_id = 'logos'
    and auth.uid()::text = split_part(name, '.', 1)
    and exists (select 1 from public.users where id = auth.uid() and role = 'admin')
  );

drop policy if exists "admins can delete logos" on storage.objects;
create policy "admins can delete logos"
  on storage.objects for delete
  using (
    bucket_id = 'logos'
    and auth.uid()::text = split_part(name, '.', 1)
    and exists (select 1 from public.users where id = auth.uid() and role = 'admin')
  );

drop policy if exists "admins can update logos" on storage.objects;
create policy "admins can update logos"
  on storage.objects for update
  using (
    bucket_id = 'logos'
    and auth.uid()::text = split_part(name, '.', 1)
    and exists (select 1 from public.users where id = auth.uid() and role = 'admin')
  );
