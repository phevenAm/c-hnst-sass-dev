-- ─────────────────────────────────────────────────────────────────────────────
-- Fix storage RLS policies for the 'avatars' bucket (todo 6f227cdc)
--
-- Ensure authenticated users can upload/update/delete their own avatar file,
-- and that avatars are publicly readable (no auth required for display).
--
-- NOTE: The 'avatars' bucket itself must be created in the Supabase dashboard
-- (Storage → New bucket → name: "avatars", public: true). This migration only
-- sets the RLS policies on storage.objects.
--
-- The upload component writes to: avatars/{user_id}.jpg
-- ─────────────────────────────────────────────────────────────────────────────

-- Anyone can read from the avatars bucket (avatars are public by design)
drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- Users can upload/replace their own avatar (path = {user_id}.jpg)
drop policy if exists "avatars user insert" on storage.objects;
create policy "avatars user insert"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = split_part(name, '.', 1)
  );

-- Users can update their own avatar
drop policy if exists "avatars user update" on storage.objects;
create policy "avatars user update"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = split_part(name, '.', 1)
  );

-- Users can delete their own avatar
drop policy if exists "avatars user delete" on storage.objects;
create policy "avatars user delete"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = split_part(name, '.', 1)
  );
