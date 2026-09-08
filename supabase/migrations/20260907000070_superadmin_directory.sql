-- ─────────────────────────────────────────────────────────────────────────────
-- superadmin_directory() — the /superadmin practices list, in one SQL round trip.
--
-- Replaces get-all-practices' reliance on supabase.auth.admin.listUsers(), which
-- started returning HTTP 500 "Database error finding users" on this project
-- (GoTrue's admin *list* endpoint; admin.getUserById still works, and the
-- underlying auth.users data checks out clean — schema is current, no null
-- token columns, no dup/blank emails). Rather than keep fighting the admin API,
-- read auth.users.email directly from a SECURITY DEFINER function, which also
-- lets us stitch in agencies without a second call.
--
-- Shape (jsonb): { practices: [...], agencies: [...] }
--   practices — standalone admins only (public.users.agency_id IS NULL). Agency
--               member admins are represented by their agency row instead, not
--               listed individually here (superadmin asked for "agencies, not
--               agency admins, and pure admins").
--   agencies  — one row per public.agencies, with its owner + active-member count.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.superadmin_directory()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $func$
declare
  v_practices jsonb;
  v_agencies  jsonb;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and coalesce(is_superadmin, false)
  ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  -- Standalone practices: the admin is not attached to any agency.
  select coalesce(jsonb_agg(row_to_json(p) order by p.updated_at desc), '[]'::jsonb)
  into v_practices
  from (
    select
      ps.id,
      ps.admin_id,
      ps.business_name,
      ps.subscription_status,
      ps.subscription_plan,
      ps.stripe_subscription_id,
      ps.billing_customer_id,
      ps.is_paused,
      ps.paused_reason,
      ps.updated_at,
      jsonb_build_object(
        'first_name', u.first_name,
        'last_name',  u.last_name,
        'email',      au.email,
        'created_at', u.created_at,
        'disabled',   coalesce(u.disabled, false)
      ) as users
    from public.practice_settings ps
    join public.users u  on u.id  = ps.admin_id
    join auth.users  au  on au.id = ps.admin_id
    where u.agency_id is null
  ) p;

  -- Agencies as first-class rows.
  select coalesce(jsonb_agg(row_to_json(a) order by a.created_at desc), '[]'::jsonb)
  into v_agencies
  from (
    select
      ag.id,
      ag.name,
      ag.subscription_plan,
      ag.billing_interval,
      ag.created_at,
      ag.updated_at,
      ag.owner_id,
      (
        select count(*) from public.agency_members m
        where m.agency_id = ag.id and m.status = 'active'
      ) as active_member_count,
      (
        select count(*) from public.users u where u.agency_id = ag.id
      ) as linked_admin_count,
      jsonb_build_object(
        'first_name', ou.first_name,
        'last_name',  ou.last_name,
        'email',      oau.email
      ) as owner
    from public.agencies ag
    left join public.users ou  on ou.id  = ag.owner_id
    left join auth.users  oau  on oau.id = ag.owner_id
  ) a;

  return jsonb_build_object('practices', v_practices, 'agencies', v_agencies);
end;
$func$;

revoke all on function public.superadmin_directory() from public, anon;

grant execute on function public.superadmin_directory() to authenticated;

comment on function public.superadmin_directory() is
  'Superadmin-only. Returns {practices, agencies} for /superadmin — reads auth.users.email directly instead of via the GoTrue admin list API.';
