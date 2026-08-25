-- PDF upload (Resources documents, client consent PDF, onboarding form PDF)
-- replaces requiring admins to already have the file hosted somewhere and
-- paste a direct .pdf link — most don't. Mirrors the 'avatars' bucket setup
-- (20260817000004), but unlike avatars this bucket is created here via SQL
-- rather than the dashboard, since there's no fixed one-file-per-user path
-- to hang a naming convention on.
--
-- Files are public (consent/onboarding/resource PDFs are shown to clients,
-- often before they're logged in), scoped to a per-admin folder for
-- deletion, and a 5MB server-side cap backs up the client-side check.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', true, 5242880, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "documents public read" on storage.objects;
create policy "documents public read"
  on storage.objects for select
  using (bucket_id = 'documents');

-- Path convention: documents/{admin_id}/{uuid}-{filename} — the first path
-- segment must be the uploader's own uid.
drop policy if exists "documents admin insert" on storage.objects;
create policy "documents admin insert"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "documents admin update" on storage.objects;
create policy "documents admin update"
  on storage.objects for update
  using (
    bucket_id = 'documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "documents admin delete" on storage.objects;
create policy "documents admin delete"
  on storage.objects for delete
  using (
    bucket_id = 'documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
