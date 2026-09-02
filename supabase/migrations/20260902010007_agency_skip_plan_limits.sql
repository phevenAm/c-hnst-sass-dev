-- Agency members are not subject to the per-admin client-count cap.
--
-- plan_limits enforcement (20260901000011) counts clients per admin and blocks
-- at the tier cap. But an agency admin's billing is the agency's (seat-based,
-- deferred), not their personal practice_settings.subscription_plan — and a
-- MANAGER building the agency's intake pool would otherwise hit their own
-- 5-client Starter cap immediately.
--
-- Fix: both enforcement triggers early-return when the owning admin is an
-- active agency member. Pure loosening — solo admins are completely unaffected
-- (the new EXISTS is false for them). When real agency billing lands it can add
-- its own agency-level cap here.

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

  -- Agency admins: billed at the agency level (deferred). Personal cap N/A.
  if exists (select 1 from public.agency_members am
             where am.user_id = v_admin and am.status = 'active') then
    return new;
  end if;

  select pl.max_active into v_max
  from public.practice_settings ps
  join public.plan_limits pl on pl.plan = ps.subscription_plan
  where ps.admin_id = v_admin;

  if v_max is null then
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

  if exists (select 1 from public.agency_members am
             where am.user_id = v_admin and am.status = 'active') then
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
