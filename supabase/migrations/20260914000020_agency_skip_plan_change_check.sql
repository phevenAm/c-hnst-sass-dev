-- plan_change_check (feeds ClientCapBanner's warning UI) was missed by
-- 20260902010007's agency exemption — that migration patched the hard
-- enforcement triggers (enforce_client_active_limit / _archived_limit) so
-- agency members are never blocked, but this RPC still looked up
-- practice_settings.subscription_plan (null/unset for an agency member, who
-- has no personal subscription) and defaulted to Starter's 5-client cap,
-- showing a scary "over your plan limit" banner to agency admins who were
-- never actually at risk of being blocked. Same exemption, same pattern.
create or replace function public.plan_change_check(p_target text)
returns jsonb
language plpgsql
stable
security definer
set search_path = 'public'
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

  -- Agency admins: billed at the agency level (deferred). Personal cap N/A —
  -- mirrors enforce_client_active_limit / enforce_client_archived_limit.
  if exists (select 1 from public.agency_members am
             where am.user_id = v_admin and am.status = 'active') then
    v_active   := public.active_client_count(v_admin);
    v_archived := public.archived_client_count(v_admin);
    return jsonb_build_object(
      'target', p_target,
      'active', v_active,
      'archived', v_archived,
      'max_active', null,
      'max_archived', null,
      'active_over', 0,
      'archived_over', 0,
      'ok', true
    );
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

notify pgrst, 'reload schema';
