-- ─────────────────────────────────────────────────────────────────────────────
-- File manager for admins and agencies.
--
-- What this is:
--   * A per-practice (and per-agency) document store: nested folders + files,
--     browsed in-app at /admin/files.
--   * Allowed content: PDF, PNG / JPEG / WebP / GIF, and Word (.doc / .docx).
--     Nothing else — no video, no archives-as-content, no executables. The
--     `file_objects_mime_ok` CHECK is the backstop; the file-upload edge
--     function is the gate.
--
-- Design — metadata tree, flat storage:
--   The folder hierarchy lives entirely in `file_folders` (self-referencing
--   `parent_id`). Every uploaded blob is stored FLAT in the `practice-files`
--   bucket, keyed by a random UUID (`u/<owner>/<uuid>` or `a/<agency>/<uuid>`).
--   The bucket never mirrors the folder names. Consequences:
--     * Rename a folder  -> one UPDATE + a recursive re-materialise of
--       descendant `path`. Zero storage operations.
--     * Move a folder/file -> one UPDATE of parent_id/folder_id. Zero storage
--       operations. A cycle guard rejects moving a folder into its own subtree.
--     * Download / preview links are keyed by row id -> the UUID path, so a
--       rename or move NEVER breaks an existing link.
--     * Delete a folder -> ON DELETE CASCADE removes descendant folders and
--       file rows; an AFTER DELETE trigger drops each blob's key into
--       `file_deletion_queue`, drained by the file-orphan-sweep function.
--
-- Quotas (see public.file_storage_quota):
--   starter / growth practice .......  2.5 GiB   (plan_limits.max_storage_bytes)
--   unlimited practice ..............  5   GiB
--   agency .........................  10   GiB   (agencies.max_storage_bytes)
--   An agency member's files ALWAYS count against the one shared agency pool
--   (their personal tree included) — billing is the agency's, so is storage.
--
-- Everything here is additive (new tables / functions / triggers / policies;
-- two tiny columns on plan_limits and agencies). No RLS toggles or constraints
-- on hot tables, one `notify pgrst` at the end. Safe to push any time per the
-- deploy-discipline notes in CLAUDE.md.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── A. Quota sources ────────────────────────────────────────────────────────
alter table public.plan_limits
  add column if not exists max_storage_bytes bigint;

update public.plan_limits set max_storage_bytes = 2684354560 where plan in ('starter', 'growth'); -- 2.5 GiB
update public.plan_limits set max_storage_bytes = 5368709120 where plan = 'unlimited';            -- 5   GiB

comment on column public.plan_limits.max_storage_bytes is
  'File-manager storage cap for this tier, in bytes. NULL = fall back to the starter cap.';

alter table public.agencies
  add column if not exists max_storage_bytes bigint not null default 10737418240; -- 10 GiB

comment on column public.agencies.max_storage_bytes is
  'Shared file-manager storage cap for the whole agency, in bytes.';

-- ── B. Bucket ───────────────────────────────────────────────────────────────
-- Private (unlike avatars / documents): these are practice records. Reads go
-- through short-lived signed URLs the SELECT policy below permits.
insert into storage.buckets (id, name, public, file_size_limit)
values ('practice-files', 'practice-files', false, 26214400)  -- 25 MiB per object
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

-- ── C. Tables ───────────────────────────────────────────────────────────────
create table if not exists public.file_folders (
  id             uuid primary key default gen_random_uuid(),
  owner_admin_id uuid not null references public.users (id) on delete cascade,
  agency_id      uuid references public.agencies (id) on delete cascade,
  parent_id      uuid references public.file_folders (id) on delete cascade,
  name           text not null,
  path           text not null default '/',   -- materialised "/A/B/C", maintained by trigger
  depth          integer not null default 0,  -- root children = 0
  shared         boolean not null default false, -- visible to the whole agency
  created_by     uuid references public.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint file_folders_name_len   check (char_length(btrim(name)) between 1 and 255),
  constraint file_folders_name_slash check (position('/' in name) = 0),
  constraint file_folders_depth_rng  check (depth between 0 and 20)
);

comment on table public.file_folders is
  'Folder tree for the in-app file manager. path/depth are materialised by trigger; storage is flat.';

create index if not exists file_folders_owner_parent_idx on public.file_folders (owner_admin_id, parent_id);
create index if not exists file_folders_agency_idx       on public.file_folders (agency_id) where agency_id is not null;
create index if not exists file_folders_path_idx         on public.file_folders (owner_admin_id, path text_pattern_ops);

-- No two folders with the same name under the same parent, per owner.
-- NULL parent (root) collapses to the all-zero uuid so it participates.
create unique index if not exists file_folders_sibling_uniq
  on public.file_folders (owner_admin_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create table if not exists public.file_objects (
  id             uuid primary key default gen_random_uuid(),
  owner_admin_id uuid not null references public.users (id) on delete cascade,
  agency_id      uuid references public.agencies (id) on delete cascade,
  folder_id      uuid references public.file_folders (id) on delete cascade, -- NULL = owner's root
  storage_path   text not null unique,
  name           text not null,
  mime_type      text not null,
  size_bytes     bigint not null,
  checksum       text,
  shared         boolean not null default false,
  created_by     uuid references public.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint file_objects_name_len check (char_length(btrim(name)) between 1 and 255),
  constraint file_objects_size_rng check (size_bytes between 0 and 26214400),
  constraint file_objects_mime_ok  check (mime_type in (
    'application/pdf',
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ))
);

comment on table public.file_objects is
  'One uploaded file. storage_path is a flat UUID key in the practice-files bucket; the tree is folder_id.';

create index if not exists file_objects_folder_idx on public.file_objects (folder_id);
create index if not exists file_objects_owner_idx  on public.file_objects (owner_admin_id);
create index if not exists file_objects_agency_idx on public.file_objects (agency_id) where agency_id is not null;

create unique index if not exists file_objects_name_uniq
  on public.file_objects (owner_admin_id, coalesce(folder_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

-- Blobs whose row is gone, awaiting removal from storage by file-orphan-sweep.
create table if not exists public.file_deletion_queue (
  storage_path text primary key,
  queued_at    timestamptz not null default now()
);
comment on table public.file_deletion_queue is
  'Orphaned storage keys (row deleted, blob not yet). Drained nightly by the file-orphan-sweep function.';

-- ── D. Functions ────────────────────────────────────────────────────────────

-- Stamp scope on INSERT. owner_admin_id falls back to auth.uid() for direct
-- FE folder creates; the edge function sets it explicitly (service role has no
-- auth.uid()). agency_id is ALWAYS resolved from the owner's active membership
-- so the quota pool is unambiguous.
create or replace function public.file_stamp_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $func$
begin
  if new.owner_admin_id is null then
    new.owner_admin_id := auth.uid();
  end if;
  if new.owner_admin_id is null then
    raise exception 'FILE_NO_OWNER: owner_admin_id could not be resolved';
  end if;

  new.agency_id := (
    select am.agency_id from public.agency_members am
    where am.user_id = new.owner_admin_id and am.status = 'active'
  );

  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$func$;

-- Recompute this folder's path + depth from its parent. Runs on INSERT and on
-- any change to parent_id / name. Also trims the name and pins scope to the
-- parent's owner.
create or replace function public.file_folder_materialise()
returns trigger
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_parent_path  text := '/';
  v_parent_depth integer := -1;
  v_parent_owner uuid;
begin
  new.name := btrim(new.name);

  if new.parent_id is not null then
    select path, depth, owner_admin_id
      into v_parent_path, v_parent_depth, v_parent_owner
      from public.file_folders where id = new.parent_id;
    if not found then
      raise exception 'FOLDER_PARENT_MISSING: parent folder % does not exist', new.parent_id;
    end if;
    if v_parent_owner is distinct from new.owner_admin_id then
      raise exception 'FOLDER_SCOPE: parent folder belongs to a different owner';
    end if;
  end if;

  new.depth := v_parent_depth + 1;
  new.path  := (case when v_parent_path = '/' then '' else v_parent_path end) || '/' || new.name;

  if new.depth > 20 then
    raise exception 'FOLDER_TOO_DEEP: maximum nesting depth is 20';
  end if;
  return new;
end;
$func$;

-- Reject moving a folder under itself or one of its descendants.
create or replace function public.file_folder_no_cycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $func$
begin
  if new.parent_id is null then
    return new;
  end if;
  if new.parent_id = new.id then
    raise exception 'FOLDER_CYCLE: a folder cannot be its own parent';
  end if;
  if exists (
    with recursive ancestors as (
      select parent_id from public.file_folders where id = new.parent_id
      union all
      select f.parent_id
        from public.file_folders f
        join ancestors a on f.id = a.parent_id
       where f.parent_id is not null
    )
    select 1 from ancestors where parent_id = new.id
  ) then
    raise exception 'FOLDER_CYCLE: cannot move a folder into its own subtree';
  end if;
  return new;
end;
$func$;

-- After a folder's path/depth changes, re-materialise the whole subtree in one
-- recursive UPDATE. Scoped to parent_id/name so the cascade's own writes (which
-- touch path/depth only) don't re-fire it.
create or replace function public.file_folder_cascade_paths()
returns trigger
language plpgsql
security definer
set search_path = ''
as $func$
begin
  if old.path is distinct from new.path or old.depth is distinct from new.depth then
    with recursive sub as (
      select f.id,
             new.path  || '/' || f.name as newpath,
             new.depth + 1              as newdepth
        from public.file_folders f
       where f.parent_id = new.id
      union all
      select f.id,
             s.newpath  || '/' || f.name,
             s.newdepth + 1
        from public.file_folders f
        join sub s on f.parent_id = s.id
    )
    update public.file_folders f
       set path = s.newpath, depth = s.newdepth, updated_at = now()
      from sub s
     where f.id = s.id
       and (f.path is distinct from s.newpath or f.depth is distinct from s.newdepth);
  end if;
  return null;
end;
$func$;

-- FE may only edit name / folder_id / shared / checksum on a file. Everything
-- that would let a client under-report usage or repoint a blob is frozen for
-- non-service-role callers.
create or replace function public.file_objects_guard_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $func$
begin
  if auth.uid() is null then       -- service role / definer context
    return new;
  end if;
  if new.storage_path    is distinct from old.storage_path
     or new.size_bytes   is distinct from old.size_bytes
     or new.mime_type    is distinct from old.mime_type
     or new.owner_admin_id is distinct from old.owner_admin_id then
    raise exception 'FILE_IMMUTABLE_COLUMN: only name, folder_id, shared and checksum are editable';
  end if;
  return new;
end;
$func$;

-- Which pool does this admin's storage count against? The agency, when they're
-- an active member; otherwise their own practice.
create or replace function public.file_storage_pool(p_admin uuid)
returns uuid
language sql stable security definer set search_path = ''
as $func$
  select am.agency_id from public.agency_members am
  where am.user_id = p_admin and am.status = 'active';
$func$;

create or replace function public.file_storage_used(p_admin uuid)
returns bigint
language plpgsql stable security definer set search_path = ''
as $func$
declare
  v_agency uuid := public.file_storage_pool(p_admin);
  v_used   bigint;
begin
  if v_agency is not null then
    select coalesce(sum(size_bytes), 0) into v_used
      from public.file_objects where agency_id = v_agency;
  else
    select coalesce(sum(size_bytes), 0) into v_used
      from public.file_objects where owner_admin_id = p_admin and agency_id is null;
  end if;
  return v_used;
end;
$func$;

create or replace function public.file_storage_quota(p_admin uuid)
returns bigint
language plpgsql stable security definer set search_path = ''
as $func$
declare
  v_agency uuid := public.file_storage_pool(p_admin);
  v_bytes  bigint;
begin
  if v_agency is not null then
    select max_storage_bytes into v_bytes from public.agencies where id = v_agency;
    return coalesce(v_bytes, 10737418240);
  end if;
  select pl.max_storage_bytes into v_bytes
    from public.practice_settings ps
    join public.plan_limits pl on pl.plan = ps.subscription_plan
   where ps.admin_id = p_admin;
  return coalesce(v_bytes, 2684354560);
end;
$func$;

-- One round-trip for the FE storage meter: the caller's own pool.
create or replace function public.file_storage_report()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $func$
declare
  v_admin uuid := auth.uid();
begin
  if v_admin is null then
    raise exception 'Not authenticated';
  end if;
  return jsonb_build_object(
    'used_bytes',  public.file_storage_used(v_admin),
    'quota_bytes', public.file_storage_quota(v_admin),
    'pool',        case when public.file_storage_pool(v_admin) is not null then 'agency' else 'practice' end
  );
end;
$func$;

-- Backstop for the edge function's own preflight check. errcode check_violation
-- so PostgREST returns a clean 400 the FE can pattern-match on the prefix.
create or replace function public.file_enforce_quota()
returns trigger
language plpgsql security definer set search_path = ''
as $func$
declare
  v_used  bigint;
  v_quota bigint;
begin
  v_quota := public.file_storage_quota(new.owner_admin_id);
  v_used  := public.file_storage_used(new.owner_admin_id);
  if v_used + new.size_bytes > v_quota then
    raise exception 'STORAGE_QUOTA_EXCEEDED: this file needs % bytes; only % of % remain',
      new.size_bytes, greatest(v_quota - v_used, 0), v_quota
      using errcode = 'check_violation';
  end if;
  return new;
end;
$func$;

create or replace function public.file_queue_storage_delete()
returns trigger
language plpgsql security definer set search_path = ''
as $func$
begin
  insert into public.file_deletion_queue (storage_path)
  values (old.storage_path)
  on conflict (storage_path) do nothing;
  return old;
end;
$func$;

-- ── E. Triggers ─────────────────────────────────────────────────────────────
-- BEFORE row triggers fire in name order, hence the numeric prefixes.

drop trigger if exists file_folders_10_scope   on public.file_folders;
create trigger file_folders_10_scope
  before insert on public.file_folders
  for each row execute function public.file_stamp_scope();

drop trigger if exists file_folders_20_nocycle on public.file_folders;
create trigger file_folders_20_nocycle
  before update of parent_id on public.file_folders
  for each row execute function public.file_folder_no_cycle();

drop trigger if exists file_folders_30_matpath on public.file_folders;
create trigger file_folders_30_matpath
  before insert or update of parent_id, name on public.file_folders
  for each row execute function public.file_folder_materialise();

drop trigger if exists file_folders_40_cascade on public.file_folders;
create trigger file_folders_40_cascade
  after update of parent_id, name on public.file_folders
  for each row execute function public.file_folder_cascade_paths();

drop trigger if exists file_folders_touch on public.file_folders;
create trigger file_folders_touch
  before update on public.file_folders
  for each row execute function public.set_updated_at();

drop trigger if exists file_objects_05_guard on public.file_objects;
create trigger file_objects_05_guard
  before update on public.file_objects
  for each row execute function public.file_objects_guard_columns();

drop trigger if exists file_objects_10_scope on public.file_objects;
create trigger file_objects_10_scope
  before insert on public.file_objects
  for each row execute function public.file_stamp_scope();

drop trigger if exists file_objects_20_quota on public.file_objects;
create trigger file_objects_20_quota
  before insert on public.file_objects
  for each row execute function public.file_enforce_quota();

drop trigger if exists file_objects_touch on public.file_objects;
create trigger file_objects_touch
  before update on public.file_objects
  for each row execute function public.set_updated_at();

drop trigger if exists file_objects_90_queue_delete on public.file_objects;
create trigger file_objects_90_queue_delete
  after delete on public.file_objects
  for each row execute function public.file_queue_storage_delete();

-- ── F. RLS ──────────────────────────────────────────────────────────────────
alter table public.file_folders        enable row level security;
alter table public.file_objects        enable row level security;
alter table public.file_deletion_queue enable row level security;  -- no policy = service-role only

drop policy if exists "file_folders read"   on public.file_folders;
drop policy if exists "file_folders insert" on public.file_folders;
drop policy if exists "file_folders update" on public.file_folders;
drop policy if exists "file_folders delete" on public.file_folders;

create policy "file_folders read" on public.file_folders for select to authenticated
  using (
    owner_admin_id = auth.uid()
    or public.acts_for_admin(owner_admin_id)
    or (shared and agency_id is not null and agency_id = public.current_agency_id())
  );
create policy "file_folders insert" on public.file_folders for insert to authenticated
  with check (owner_admin_id = auth.uid());
create policy "file_folders update" on public.file_folders for update to authenticated
  using  (owner_admin_id = auth.uid() or public.acts_for_admin(owner_admin_id))
  with check (owner_admin_id = auth.uid() or public.acts_for_admin(owner_admin_id));
create policy "file_folders delete" on public.file_folders for delete to authenticated
  using (owner_admin_id = auth.uid() or public.acts_for_admin(owner_admin_id));

drop policy if exists "file_objects read"   on public.file_objects;
drop policy if exists "file_objects update" on public.file_objects;
drop policy if exists "file_objects delete" on public.file_objects;

create policy "file_objects read" on public.file_objects for select to authenticated
  using (
    owner_admin_id = auth.uid()
    or public.acts_for_admin(owner_admin_id)
    or (shared and agency_id is not null and agency_id = public.current_agency_id())
  );
-- INSERT deliberately has NO policy: files only enter through the file-upload
-- edge function (service role), which keeps the blob and the row consistent.
create policy "file_objects update" on public.file_objects for update to authenticated
  using  (owner_admin_id = auth.uid() or public.acts_for_admin(owner_admin_id))
  with check (owner_admin_id = auth.uid() or public.acts_for_admin(owner_admin_id));
create policy "file_objects delete" on public.file_objects for delete to authenticated
  using (owner_admin_id = auth.uid() or public.acts_for_admin(owner_admin_id));

-- ── G. Storage policies (practice-files bucket) ─────────────────────────────
-- Read-only for authenticated users, scoped by the first two path segments
-- (u/<owner> or a/<agency>), plus managers via a file_objects lookup. Writes
-- and deletes are service-role only.
drop policy if exists "practice-files read" on storage.objects;
create policy "practice-files read" on storage.objects for select to authenticated
  using (
    bucket_id = 'practice-files'
    and (
      ((storage.foldername(name))[1] = 'u' and (storage.foldername(name))[2] = auth.uid()::text)
      or ((storage.foldername(name))[1] = 'a'
          and (storage.foldername(name))[2] = public.current_agency_id()::text)
      or exists (
        select 1 from public.file_objects fo
        where fo.storage_path = storage.objects.name
          and public.acts_for_admin(fo.owner_admin_id)
      )
    )
  );

-- ── H. Grants ───────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.file_folders to authenticated;
grant select, update, delete          on public.file_objects to authenticated; -- no INSERT
revoke all on public.file_deletion_queue from anon, authenticated;

revoke all on function public.file_storage_pool(uuid)   from public, anon;
revoke all on function public.file_storage_used(uuid)   from public, anon;
revoke all on function public.file_storage_quota(uuid)  from public, anon;
revoke all on function public.file_storage_report()     from public, anon;
grant execute on function public.file_storage_pool(uuid)  to authenticated;
grant execute on function public.file_storage_used(uuid)  to authenticated;
grant execute on function public.file_storage_quota(uuid) to authenticated;
grant execute on function public.file_storage_report()    to authenticated;

-- ── I. Nightly orphan sweep ────────────────────────────────────────────────
-- Removes blobs whose rows are gone (file_deletion_queue). Needs the Vault
-- secret `internal_file_sweep_secret` (same value as the edge function's
-- INTERNAL_FILE_SWEEP_SECRET env var) — see the deploy notes for this migration.
select cron.unschedule('file-orphan-sweep')
where exists (select 1 from cron.job where jobname = 'file-orphan-sweep');

select cron.schedule(
  'file-orphan-sweep',
  '17 3 * * *',
  $cron$
  select net.http_post(
    url     := 'https://mxyfdvfbdrusbjiozuzx.supabase.co/functions/v1/file-orphan-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'internal_file_sweep_secret')
    ),
    body    := jsonb_build_object('trigger', 'cron')
  );
  $cron$
);

notify pgrst, 'reload schema';
