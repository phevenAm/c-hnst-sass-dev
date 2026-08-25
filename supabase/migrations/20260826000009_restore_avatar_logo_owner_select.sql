-- 20260826000008 dropped every SELECT policy on avatars/logos to close the
-- anonymous-listing leak, on the assumption that the public object-serving
-- endpoint (/storage/v1/object/public/...) is all that's needed for
-- displaying an avatar/logo, since it bypasses storage.objects RLS
-- entirely. That part is true — but it's not the whole picture: replacing
-- an existing avatar/logo (upload with upsert:true, or .update()) failed
-- immediately after that migration, because the storage-api's
-- update/upsert path does its own RLS-gated SELECT to locate the existing
-- row first, before the UPDATE policy is ever evaluated. With no SELECT
-- policy at all, even the owner can't find their own row to replace it.
-- Caught live: re-uploading an avatar over an existing one started failing
-- with "new row violates row-level security policy" straight after the
-- previous migration, for the legitimate owner.
--
-- Fix: restore a SELECT policy, but owner-scoped this time (matching
-- insert/update/delete) instead of the unrestricted `bucket_id = 'avatars'`
-- one that caused the listing leak in the first place. This is the same
-- pattern already used for the documents bucket ("documents admin list
-- own" in 20260826000007) — an admin/user can see their own file (enough
-- for update/upsert to work), nobody can browse anyone else's.

create policy "avatars user select"
  on storage.objects for select
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = split_part(name, '.', 1)
  );

create policy "logos admin select"
  on storage.objects for select
  using (
    bucket_id = 'logos'
    and auth.uid()::text = split_part(name, '.', 1)
    and exists (select 1 from public.users where id = auth.uid() and role = 'admin')
  );
