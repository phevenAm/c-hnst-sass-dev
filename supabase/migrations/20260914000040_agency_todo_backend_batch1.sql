-- Agency todo-list backend batch 1 (2026-09-14). Addresses several items from
-- Stephen's admin_todos list in one small, additive batch: no destructive ops,
-- no ENABLE RLS on existing big tables, safe to push any time per the
-- migration-deploy-discipline rule in CLAUDE.md.
--
-- Covers: extension_in_public linter warning; agency members can no longer
-- self-create client_stubs (must come via assignment); agency file-manager
-- quota cut from 10 GiB to 5 GiB; "counsellor removed from client" flow with
-- a previously_counselled marker; self-service "request removal" for staff
-- (managers could already hard-remove via the remove-agency-member fn);
-- agency-wide lock on the auto-cancel session policy; hard backstop enforcing
-- agencies.require_note_encryption (previously stored but never read); a
-- generic per-client feature-flag override table for superadmin use.

-- ── 1. Linter: "Extension in Public" (pg_net) ──────────────────────────────
-- pg_net's own functions already live in the fixed `net` schema (every
-- net.http_post() call site is already schema-qualified — see
-- 20260828000001_schedule_client_session_reminders.sql etc.), so moving the
-- extension's own catalog entry out of `public` doesn't touch any call site.
-- Guarded: some environments (clarity-STAGING) don't have pg_net enabled at
-- all, and clarity-LIVE's Supabase-managed pg_net actively refuses SET SCHEMA
-- ("extension pg_net does not support SET SCHEMA") — Supabase pins its
-- schema. Both are caught so this is a no-op rather than aborting the batch;
-- the WARN stays open pending a Supabase-side fix, tracked back on the todo
-- list rather than silently dropped.
do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_net') then
    alter extension pg_net set schema extensions;
  end if;
exception
  when feature_not_supported then
    raise notice 'pg_net does not support SET SCHEMA on this project — left in public, Supabase-managed restriction';
end;
$do$;

-- ── 2. Agency counsellors/freelancers can't self-acquire clients ──────────
-- "admins manage own stubs" previously granted ALL (incl. INSERT) to anyone
-- matching created_by = auth.uid() — that covers agency counsellor members
-- too, letting them insert a fresh client_stub straight into their own
-- caseload, bypassing the manager-assignment flow entirely. Split the policy
-- so SELECT/UPDATE/DELETE stay as-is (a member still owns clients handed to
-- them via respond_to_agency_assignment) but INSERT is blocked for active
-- non-manager agency members. Managers keep inserting intake stubs directly
-- (createIntakeClient in agencySlice.ts) and solo admins are unaffected.
drop policy if exists "admins manage own stubs" on client_stubs;

create policy "admins manage own stubs select"
  on client_stubs for select
  using (created_by = auth.uid());

create policy "admins manage own stubs update"
  on client_stubs for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "admins manage own stubs delete"
  on client_stubs for delete
  using (created_by = auth.uid());

create policy "admins insert own stubs"
  on client_stubs for insert
  with check (
    created_by = auth.uid()
    and not exists (
      select 1 from agency_members am
      where am.user_id = auth.uid() and am.status = 'active' and am.role = 'counsellor'
    )
  );

-- ── 3. Agency file storage: 10 GiB → 5 GiB ─────────────────────────────────
alter table agencies alter column max_storage_bytes set default 5368709120;

-- Only touch agencies still sat on the old default — anything already
-- hand-tuned to a custom value is left alone.
update agencies set max_storage_bytes = 5368709120 where max_storage_bytes = 10737418240;

create or replace function file_storage_quota(p_admin uuid)
 returns bigint
 language plpgsql
 stable security definer
 set search_path to ''
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
    return coalesce(v_bytes, 5368709120);
  end if;
  select pl.max_storage_bytes into v_bytes
    from public.practice_settings ps
    join public.plan_limits pl on pl.plan = ps.subscription_plan
   where ps.admin_id = p_admin;
  return coalesce(v_bytes, 2684354560);
end;
$func$;

-- ── 4. Counsellor removed from client → back to waiting list ──────────────
alter table client_assignments drop constraint if exists client_assignments_status_check;
alter table client_assignments
  add constraint client_assignments_status_check check (status = any (array['pending', 'accepted', 'declined', 'ended']));

alter table client_stubs add column if not exists previously_counselled boolean not null default false;

create or replace function remove_client_assignment(p_assignment_id uuid, p_reason text default null)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $func$
declare
  v_assignment record;
begin
  select * into v_assignment from public.client_assignments where id = p_assignment_id;
  if v_assignment is null then
    raise exception 'ASSIGNMENT_NOT_FOUND';
  end if;
  if v_assignment.status <> 'accepted' then
    raise exception 'NOT_ACTIVE_ASSIGNMENT: only an accepted assignment can be ended';
  end if;
  if not public.acts_for_admin(v_assignment.to_admin_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  update public.client_assignments
    set status = 'ended', decline_reason = p_reason, responded_at = now()
    where id = p_assignment_id;

  update public.client_stubs
    set previously_counselled = true
    where id = v_assignment.stub_id;

  perform public.log_agency_event(
    v_assignment.agency_id,
    auth.uid(),
    'client_unassigned',
    'client',
    v_assignment.stub_id::text,
    'Counsellor removed — client returned to the waiting list',
    jsonb_build_object('reason', p_reason, 'previous_admin', v_assignment.to_admin_id)
  );
end;
$func$;

grant execute on function remove_client_assignment(uuid, text) to authenticated;

-- ── 5. Staff self-service "request removal" ────────────────────────────────
-- Managers could already hard-remove a member (remove-agency-member edge fn,
-- with caseload reassignment). This adds the missing other half: a
-- non-manager can flag that they want to leave, which notifies every active
-- manager rather than acting unilaterally.
alter table agency_members add column if not exists deletion_requested_at timestamptz;
alter table agency_members add column if not exists deletion_requested_reason text;

create or replace function request_agency_member_removal(p_reason text default null)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $func$
declare
  v_member record;
  v_manager record;
begin
  select * into v_member from public.agency_members where user_id = auth.uid();
  if v_member is null then
    raise exception 'NOT_A_MEMBER';
  end if;

  update public.agency_members
    set deletion_requested_at = now(), deletion_requested_reason = p_reason
    where user_id = auth.uid();

  perform public.log_agency_event(
    v_member.agency_id,
    auth.uid(),
    'member_removal_requested',
    'member',
    v_member.id::text,
    'Requested to leave the agency',
    jsonb_build_object('reason', p_reason)
  );

  for v_manager in
    select user_id from public.agency_members
    where agency_id = v_member.agency_id and role = 'manager' and status = 'active'
  loop
    insert into public.notifications (user_id, type, message)
    values (v_manager.user_id, 'agency_member_removal_requested', 'A staff member asked to leave the agency');
  end loop;
end;
$func$;

grant execute on function request_agency_member_removal(text) to authenticated;

-- ── 6. Delegated settings: agency-locked auto-cancel policy ───────────────
-- Generalises the existing locked_consent/locked_email_templates pattern to
-- one more "standard" per-practice setting agencies can take over.
alter table agencies add column if not exists locked_session_policy boolean not null default false;
alter table agencies add column if not exists default_auto_cancel_enabled boolean not null default true;

create or replace function enforce_agency_session_policy()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $func$
declare
  v_agency_id uuid;
  v_locked boolean;
  v_default boolean;
  v_is_manager boolean;
begin
  select ag.id, ag.locked_session_policy, ag.default_auto_cancel_enabled
    into v_agency_id, v_locked, v_default
    from public.users u
    join public.agencies ag on ag.id = u.agency_id
    where u.id = new.admin_id;

  if v_agency_id is null or not coalesce(v_locked, false) then
    return new;
  end if;

  -- Service-role/cron writes (no auth.uid()) and managers pass through untouched.
  if auth.uid() is null then
    return new;
  end if;

  select exists(
    select 1 from public.agency_members am
    where am.user_id = auth.uid() and am.agency_id = v_agency_id and am.role = 'manager' and am.status = 'active'
  ) into v_is_manager;

  if v_is_manager then
    return new;
  end if;

  new.auto_cancel_enabled := v_default;
  return new;
end;
$func$;

drop trigger if exists agency_session_policy_lock on practice_settings;
create trigger agency_session_policy_lock
  before insert or update on practice_settings
  for each row execute function enforce_agency_session_policy();

-- ── 7. Enforce agencies.require_note_encryption (previously unenforced) ───
-- The Settings toggle has existed since 20260902010000 but nothing ever read
-- it — any member could still write plaintext notes. This is the hard
-- backstop; it only gates the WRITE path, so "freelancers can still see/edit
-- their own notes" is untouched (decryption stays per-admin-key as today).
create or replace function enforce_agency_note_encryption()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $func$
declare
  v_required boolean;
begin
  select ag.require_note_encryption into v_required
    from public.users u
    join public.agencies ag on ag.id = u.agency_id
    where u.id = new.admin_id;

  if coalesce(v_required, false) and not coalesce(new.is_encrypted, false) then
    raise exception 'AGENCY_ENCRYPTION_REQUIRED: your agency requires session notes to be encrypted — set up encryption in Settings first'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$func$;

drop trigger if exists agency_note_encryption_guard on session_notes;
create trigger agency_note_encryption_guard
  before insert or update on session_notes
  for each row execute function enforce_agency_note_encryption();

-- ── 8. Per-client feature overrides (superadmin-controlled) ───────────────
create table if not exists client_feature_overrides (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid references auth.users (id) on delete cascade,
  stub_id uuid references client_stubs (id) on delete cascade,
  feature_key text not null,
  enabled boolean not null default true,
  note text,
  set_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  constraint client_feature_overrides_one_subject check (
    (client_user_id is not null and stub_id is null) or (client_user_id is null and stub_id is not null)
  )
);

create unique index if not exists client_feature_overrides_user_key
  on client_feature_overrides (client_user_id, feature_key) where client_user_id is not null;
create unique index if not exists client_feature_overrides_stub_key
  on client_feature_overrides (stub_id, feature_key) where stub_id is not null;

alter table client_feature_overrides enable row level security;

drop policy if exists "superadmin manages client feature overrides" on client_feature_overrides;
create policy "superadmin manages client feature overrides"
  on client_feature_overrides
  for all
  using (exists (select 1 from users u where u.id = auth.uid() and u.is_superadmin))
  with check (exists (select 1 from users u where u.id = auth.uid() and u.is_superadmin));

drop policy if exists "owning admin reads their clients feature overrides" on client_feature_overrides;
create policy "owning admin reads their clients feature overrides"
  on client_feature_overrides
  for select
  using (
    exists (
      select 1 from client_stubs cs
      where cs.id = client_feature_overrides.stub_id and (cs.created_by = auth.uid() or acts_for_admin(cs.created_by))
    )
    or exists (
      select 1 from users u
      where u.id = client_feature_overrides.client_user_id and (u.admin_id = auth.uid() or acts_for_admin(u.admin_id))
    )
  );

notify pgrst, 'reload schema';
