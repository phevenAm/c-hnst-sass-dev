-- The 'documents public read' policy from 20260826000006 was broader than
-- it needed to be: it made every row in storage.objects for this bucket
-- selectable by anyone, including anonymously. That doesn't just make a
-- known file's URL fetchable (which is already true independent of any RLS
-- policy, since the bucket itself is public — see below) — it also makes
-- the bucket's *directory listing* fetchable via storage.list(), with no
-- auth at all. Verified live: an anonymous client could list the bucket
-- root and see every admin's folder (their user id), then list a folder
-- and see every filename in it. Caught this by testing storage.list()
-- directly rather than assuming; a fetch-a-known-URL test alone wouldn't
-- have shown it.
--
-- Fetching a specific file by its exact public URL does NOT depend on this
-- policy at all — Supabase serves /storage/v1/object/public/{bucket}/{path}
-- unconditionally once the bucket's own `public` flag is true (set in
-- 20260826000006), bypassing storage.objects RLS entirely for that
-- endpoint. So dropping this policy only removes the ability to *browse*
-- the bucket — consent/onboarding/resource PDFs displayed via their stored
-- URL keep working exactly as before.
--
-- Replaced with the same admin-owns-this-folder scoping already used for
-- insert/update/delete, so an admin can still list their own uploads (if a
-- "manage my documents" UI is ever built) without exposing anyone else's.

drop policy if exists "documents public read" on storage.objects;

create policy "documents admin list own"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
