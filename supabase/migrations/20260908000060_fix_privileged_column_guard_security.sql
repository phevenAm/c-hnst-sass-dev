-- ─────────────────────────────────────────────────────────────────────────────
-- Fix 20260908000030: the guard trigger functions were created SECURITY
-- DEFINER, so `current_user` inside them was always the function owner
-- (`postgres`) — never `authenticated`. The very first check
-- (`if current_user <> 'authenticated' then return new`) therefore always
-- short-circuited and the guards did nothing. Verified: an `authenticated`
-- session could still `update public.users set is_superadmin = true`.
--
-- Recreate both as SECURITY INVOKER (the default) so `current_user` reflects
-- the real executing role:
--   * direct PostgREST write            → current_user = 'authenticated'  (guarded)
--   * SECURITY DEFINER RPC (postgres)   → current_user = 'postgres'       (exempt)
--   * service_role edge function        → current_user = 'service_role'   (exempt)
-- The functions only read NEW/OLD and RAISE, so they need no elevated rights.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.guard_users_privileged_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $func$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if auth.uid() = old.id then
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

create or replace function public.guard_practice_settings_billing_columns()
returns trigger
language plpgsql
security invoker
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

notify pgrst, 'reload schema';
