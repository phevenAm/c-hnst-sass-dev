-- File-manager hardening — follow-up to 20260909000400 (security review 2026-09-10).
--
-- 1. file_storage_used(uuid) / file_storage_quota(uuid) took an arbitrary admin
--    UUID and were EXECUTE-able by any authenticated user, leaking that
--    practice's total stored-byte count and its plan's storage cap (≈ its
--    subscription tier). Add a caller guard: you may only ask about your own
--    pool, or one you already act for as an agency manager. The service role
--    (auth.uid() IS NULL — used by the file-upload edge function and the
--    file_enforce_quota trigger) is unaffected.
--
-- 2. file_objects has a column-immutability guard; file_folders did not, so an
--    admin could hand-edit owner_admin_id / agency_id / shared on their own
--    folder rows via PostgREST. No cross-tenant impact was found (current_agency_id()
--    is always the reader's), but freeze them anyway — only name / parent_id
--    (rename + move) should be client-editable. path / depth stay trigger-managed
--    and are deliberately NOT frozen here so the subtree cascade can rewrite them.

-- ── 1. Quota-function caller guard ──────────────────────────────────────────
create or replace function public.file_storage_used(p_admin uuid)
returns bigint
language plpgsql stable security definer set search_path = ''
as $func$
declare
  v_agency uuid;
  v_used   bigint;
begin
  if auth.uid() is not null
     and p_admin <> auth.uid()
     and not public.acts_for_admin(p_admin) then
    raise exception 'NOT_AUTHORIZED: you can only read your own storage usage';
  end if;

  v_agency := public.file_storage_pool(p_admin);
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
  v_agency uuid;
  v_bytes  bigint;
begin
  if auth.uid() is not null
     and p_admin <> auth.uid()
     and not public.acts_for_admin(p_admin) then
    raise exception 'NOT_AUTHORIZED: you can only read your own storage quota';
  end if;

  v_agency := public.file_storage_pool(p_admin);
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

-- Grants are unchanged (still EXECUTE to authenticated) — the guard is inside.

-- ── 2. file_folders column-immutability guard ──────────────────────────────
create or replace function public.file_folders_guard_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $func$
begin
  if auth.uid() is null then          -- service role / definer context
    return new;
  end if;
  if new.owner_admin_id is distinct from old.owner_admin_id
     or new.agency_id   is distinct from old.agency_id
     or new.shared      is distinct from old.shared then
    raise exception 'FOLDER_IMMUTABLE_COLUMN: only a folder''s name and location can be changed';
  end if;
  return new;
end;
$func$;

drop trigger if exists file_folders_05_guard on public.file_folders;
create trigger file_folders_05_guard
  before update on public.file_folders
  for each row execute function public.file_folders_guard_columns();

notify pgrst, 'reload schema';
