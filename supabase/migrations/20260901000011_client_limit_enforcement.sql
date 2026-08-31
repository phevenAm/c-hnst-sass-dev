-- Client-limit enforcement for the usage-based subscription tiers.
--
-- Pricing model: each tier (see public.plan_limits) caps ACTIVE clients and,
-- separately, ARCHIVED clients. "Active" is the billable count; archiving a
-- client frees an active slot. Hitting a cap hard-blocks the operation with a
-- coded error the frontend turns into an "upgrade or archive" dialog.
--
-- DEPENDS ON the client-lifecycle migrations (20260901000000+): users.archived_at
-- and client_stubs.archived_at. Filename ordering puts this after both those and
-- after 20260901000010_subscription_tiers.sql (plan_limits). Do NOT apply this
-- before the lifecycle migrations are present.
--
-- Definitions:
--   active   = role='client', deleted_at IS NULL, archived_at IS NULL
--              + client_stubs with linked_user_id IS NULL, archived_at IS NULL
--   archived = as above but archived_at IS NOT NULL
--   A converted stub (linked_user_id set) is counted as its real user row, not twice.
--   Paused clients (users.disabled) still count as active — pausing is not an escape hatch.

-- ── Counts ──────────────────────────────────────────────────────────────────
create or replace function public.active_client_count(p_admin uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $func$
  select
    (select count(*) from public.users
       where admin_id = p_admin
         and role = 'client'
         and deleted_at is null
         and archived_at is null)
  + (select count(*) from public.client_stubs
       where created_by = p_admin
         and linked_user_id is null
         and archived_at is null);
$func$;

create or replace function public.archived_client_count(p_admin uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $func$
  select
    (select count(*) from public.users
       where admin_id = p_admin
         and role = 'client'
         and deleted_at is null
         and archived_at is not null)
  + (select count(*) from public.client_stubs
       where created_by = p_admin
         and linked_user_id is null
         and archived_at is not null);
$func$;

revoke execute on function public.active_client_count(uuid) from public;
revoke execute on function public.archived_client_count(uuid) from public;
grant execute on function public.active_client_count(uuid) to authenticated;
grant execute on function public.archived_client_count(uuid) to authenticated;

-- ── Enforcement: active limit ───────────────────────────────────────────────
-- Fires on inserting a new client/stub and on transitions INTO the active
-- state (unarchive, undelete, role -> client). No-op updates that were already
-- active consume no new slot and are let through.
create or replace function public.enforce_client_active_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_admin        uuid;
  v_active_now   boolean;
  v_active_before boolean := false;
  v_max          integer;
  v_count        integer;
begin
  if tg_table_name = 'users' then
    v_admin := new.admin_id;
    v_active_now := new.role = 'client' and new.deleted_at is null and new.archived_at is null;
    if tg_op = 'UPDATE' then
      v_active_before := old.role = 'client' and old.deleted_at is null and old.archived_at is null;
    end if;
  elsif tg_table_name = 'client_stubs' then
    v_admin := new.created_by;
    v_active_now := new.linked_user_id is null and new.archived_at is null;
    if tg_op = 'UPDATE' then
      v_active_before := old.linked_user_id is null and old.archived_at is null;
    end if;
  else
    return new;
  end if;

  if not v_active_now or v_active_before or v_admin is null then
    return new;
  end if;

  select pl.max_active into v_max
  from public.practice_settings ps
  join public.plan_limits pl on pl.plan = ps.subscription_plan
  where ps.admin_id = v_admin;

  if v_max is null then          -- unlimited tier, or no settings row: fail open
    return new;
  end if;

  v_count := public.active_client_count(v_admin);

  if v_count >= v_max then
    raise exception
      'PLAN_LIMIT_ACTIVE: your plan allows % active clients (you have %). Archive a client or upgrade to add another.',
      v_max, v_count;
  end if;

  return new;
end;
$func$;

-- ── Enforcement: archived limit ─────────────────────────────────────────────
create or replace function public.enforce_client_archived_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_admin          uuid;
  v_archived_now   boolean;
  v_archived_before boolean := false;
  v_max            integer;
  v_count          integer;
begin
  if tg_table_name = 'users' then
    v_admin := new.admin_id;
    v_archived_now := new.role = 'client' and new.deleted_at is null and new.archived_at is not null;
    if tg_op = 'UPDATE' then
      v_archived_before := old.role = 'client' and old.deleted_at is null and old.archived_at is not null;
    end if;
  elsif tg_table_name = 'client_stubs' then
    v_admin := new.created_by;
    v_archived_now := new.linked_user_id is null and new.archived_at is not null;
    if tg_op = 'UPDATE' then
      v_archived_before := old.linked_user_id is null and old.archived_at is not null;
    end if;
  else
    return new;
  end if;

  if not v_archived_now or v_archived_before or v_admin is null then
    return new;
  end if;

  select pl.max_archived into v_max
  from public.practice_settings ps
  join public.plan_limits pl on pl.plan = ps.subscription_plan
  where ps.admin_id = v_admin;

  if v_max is null then
    return new;
  end if;

  v_count := public.archived_client_count(v_admin);

  if v_count >= v_max then
    raise exception
      'PLAN_LIMIT_ARCHIVED: your plan allows % archived clients (you have %). Upgrade or permanently remove one.',
      v_max, v_count;
  end if;

  return new;
end;
$func$;

drop trigger if exists enforce_client_active_limit_users on public.users;
create trigger enforce_client_active_limit_users
  before insert or update on public.users
  for each row execute function public.enforce_client_active_limit();

drop trigger if exists enforce_client_active_limit_stubs on public.client_stubs;
create trigger enforce_client_active_limit_stubs
  before insert or update on public.client_stubs
  for each row execute function public.enforce_client_active_limit();

drop trigger if exists enforce_client_archived_limit_users on public.users;
create trigger enforce_client_archived_limit_users
  before insert or update on public.users
  for each row execute function public.enforce_client_archived_limit();

drop trigger if exists enforce_client_archived_limit_stubs on public.client_stubs;
create trigger enforce_client_archived_limit_stubs
  before insert or update on public.client_stubs
  for each row execute function public.enforce_client_archived_limit();

-- ── plan_change_check(target): does the caller fit within `target`'s caps? ───
-- Used by the in-app subscription screen to gate a downgrade ("archive 3
-- clients first") and by change-subscription-plan before it touches Stripe.
create or replace function public.plan_change_check(p_target text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $func$
declare
  v_admin        uuid := auth.uid();
  v_active       integer;
  v_archived     integer;
  v_max_active   integer;
  v_max_archived integer;
begin
  if v_admin is null then
    raise exception 'Not authenticated';
  end if;

  select max_active, max_archived into v_max_active, v_max_archived
  from public.plan_limits where plan = p_target;

  if not found then
    raise exception 'Unknown plan: %', p_target;
  end if;

  v_active   := public.active_client_count(v_admin);
  v_archived := public.archived_client_count(v_admin);

  return jsonb_build_object(
    'target',        p_target,
    'active',        v_active,
    'archived',      v_archived,
    'max_active',    v_max_active,
    'max_archived',  v_max_archived,
    'active_over',   case when v_max_active   is null then 0 else greatest(0, v_active   - v_max_active)   end,
    'archived_over', case when v_max_archived is null then 0 else greatest(0, v_archived - v_max_archived) end,
    'ok',
      (v_max_active   is null or v_active   <= v_max_active) and
      (v_max_archived is null or v_archived <= v_max_archived)
  );
end;
$func$;

revoke execute on function public.plan_change_check(text) from public;
grant execute on function public.plan_change_check(text) to authenticated;
