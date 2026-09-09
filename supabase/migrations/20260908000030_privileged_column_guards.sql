-- ─────────────────────────────────────────────────────────────────────────────
-- C2 — lock privileged columns against direct (RLS-path) writes.
--
-- public.users and public.practice_settings have permissive UPDATE policies
-- keyed only on ownership (`id = auth.uid()` / `admin_id = auth.uid()` /
-- `acts_for_admin(admin_id)`) with NO with_check column restriction. Postgres
-- reuses USING as WITH CHECK, so the only constraint on the new row is that you
-- still own it — every other column is freely writable by the owner over
-- PostgREST.
--
-- Impact on users: any authenticated user could
--   update public.users
--     set is_superadmin = true, role = 'admin', disabled = false,
--         archived_at = null, deleted_at = null
--   where id = auth.uid()
-- → instant platform superadmin (the "superadmin can read all users" policy +
--   get-all-practices + superadmin_directory expose every practice's clients
--   and billing IDs), plus un-pause / un-archive / un-delete self and bypass
--   the consent gate.
--
-- Fix: BEFORE UPDATE triggers that reject changes to sensitive columns when the
-- write arrives as the `authenticated` role (i.e. straight from PostgREST under
-- RLS). SECURITY DEFINER RPCs (admin_archive_client, anonymise_client,
-- delete_own_account, consume_platform_access_token, consume_agency_invite, …)
-- run as `postgres`; edge functions run as `service_role`. Both are exempt and
-- keep working. Ordinary profile self-edits (name, display_name, avatar, dob,
-- focus_keywords, has_consented/consented_at/consent_signed_name, last_seen_at,
-- onboarding_completed, email_prefs_disabled, profile_show_*) stay allowed, as
-- does normal client admin (disabled, archived_at, admin_codename).
--
-- Denylist, not allowlist: any NEW privileged column added to either table
-- later must be added here explicitly.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── public.users ────────────────────────────────────────────────────────────
create or replace function public.guard_users_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $func$
begin
  -- Trusted callers: SECURITY DEFINER funcs (postgres), service_role edge
  -- functions, direct DB / migration work. Only gate genuine end-user writes.
  if current_user <> 'authenticated' then
    return new;
  end if;

  if auth.uid() = old.id then
    -- Self-edit via "users update own row": no privileged column may move.
    if new.role               is distinct from old.role
    or new.admin_id           is distinct from old.admin_id
    or new.agency_id          is distinct from old.agency_id
    or new.is_superadmin      is distinct from old.is_superadmin
    or new.is_root_admin      is distinct from old.is_root_admin
    or new.is_demo            is distinct from old.is_demo
    or new.disabled           is distinct from old.disabled
    or new.archived_at        is distinct from old.archived_at
    or new.archived_reason    is distinct from old.archived_reason
    or new.deleted_at         is distinct from old.deleted_at
    or new.anonymised_at      is distinct from old.anonymised_at
    or new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.unsubscribe_token  is distinct from old.unsubscribe_token
    or new.email              is distinct from old.email
    then
      raise exception 'permission denied: privileged column on public.users is not self-editable'
        using errcode = '42501';
    end if;
  else
    -- Someone else's row via "admins update own clients" or "agency managers
    -- act for members". Normal client admin (disabled, archived_at,
    -- archived_reason, admin_codename, name fields) stays allowed; identity /
    -- privilege / billing columns do not.
    if new.role               is distinct from old.role
    or new.admin_id           is distinct from old.admin_id
    or new.agency_id          is distinct from old.agency_id
    or new.is_superadmin      is distinct from old.is_superadmin
    or new.is_root_admin      is distinct from old.is_root_admin
    or new.is_demo            is distinct from old.is_demo
    or new.deleted_at         is distinct from old.deleted_at
    or new.anonymised_at      is distinct from old.anonymised_at
    or new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.unsubscribe_token  is distinct from old.unsubscribe_token
    or new.email              is distinct from old.email
    then
      raise exception 'permission denied: privileged column on public.users is not editable via a direct write'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$func$;

drop trigger if exists guard_users_privileged_columns on public.users;
create trigger guard_users_privileged_columns
  before update on public.users
  for each row execute function public.guard_users_privileged_columns();

-- ── public.practice_settings ───────────────────────────────────────────────
-- Billing / subscription / pause / Stripe-Connect / complimentary / promo /
-- referral columns are written only by the Stripe webhook (service_role) and
-- by SECURITY DEFINER RPCs. An admin editing their settings form as
-- `authenticated` has no legitimate path to any of them.
create or replace function public.guard_practice_settings_billing_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $func$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if new.admin_id                          is distinct from old.admin_id
  or new.subscription_status               is distinct from old.subscription_status
  or new.subscription_plan                 is distinct from old.subscription_plan
  or new.stripe_subscription_id            is distinct from old.stripe_subscription_id
  or new.billing_customer_id               is distinct from old.billing_customer_id
  or new.subscription_cancel_at_period_end is distinct from old.subscription_cancel_at_period_end
  or new.subscription_current_period_end   is distinct from old.subscription_current_period_end
  or new.billing_period                    is distinct from old.billing_period
  or new.billing_interval                  is distinct from old.billing_interval
  or new.is_paused                         is distinct from old.is_paused
  or new.paused_at                         is distinct from old.paused_at
  or new.paused_reason                     is distinct from old.paused_reason
  or new.stripe_connect_account_id         is distinct from old.stripe_connect_account_id
  or new.stripe_connect_onboarded          is distinct from old.stripe_connect_onboarded
  or new.complimentary                     is distinct from old.complimentary
  or new.complimentary_reason              is distinct from old.complimentary_reason
  or new.promo_code                        is distinct from old.promo_code
  or new.promo_trial_ends_at               is distinct from old.promo_trial_ends_at
  or new.referred_by_code                  is distinct from old.referred_by_code
  or new.referral_code                     is distinct from old.referral_code
  then
    raise exception 'permission denied: billing / subscription columns on public.practice_settings are not directly editable'
      using errcode = '42501';
  end if;

  return new;
end;
$func$;

drop trigger if exists guard_practice_settings_billing_columns on public.practice_settings;
create trigger guard_practice_settings_billing_columns
  before update on public.practice_settings
  for each row execute function public.guard_practice_settings_billing_columns();

-- Trigger functions are invoked by the trigger machinery regardless of ACL;
-- no client role needs EXECUTE (matches the round-2/3 linter cleanup).
revoke execute on function public.guard_users_privileged_columns()            from public, anon, authenticated;
revoke execute on function public.guard_practice_settings_billing_columns()   from public, anon, authenticated;

notify pgrst, 'reload schema';
