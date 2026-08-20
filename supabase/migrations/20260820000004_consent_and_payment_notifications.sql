-- ─────────────────────────────────────────────────────────────────────────────
-- Two admin-facing gaps reported tonight:
--
-- 1. Client consent (has_consented/consented_at on users, added in
--    20260813000007_client_consent.sql) is tracked but nothing ever told
--    the admin it happened, and it wasn't visible anywhere on the client's
--    page. This adds a notification, deep-linked to the client's detail
--    page.
--
-- 2. request_manual_payment() (20260817000008/20260819000006) already
--    flips sessions.manual_payment_status to 'pending', and
--    AdminPaymentsPage already has a "Pending bank transfers" approve/
--    decline section wired to respond_manual_payment() — the admin-side UI
--    to confirm/decline a payment already exists. What's missing is any
--    signal that tells the admin it's waiting: no notification is created
--    on that transition, so the only way to discover a pending payment is
--    to happen to visit /admin/payments.
--
-- Both notifications set `url` (existing triggers — email_log_admin_notify
-- — never did), since a notification that doesn't deep-link anywhere is
-- functionally a dead end.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.notify_admin_client_consented()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
begin
  if new.has_consented = true and coalesce(old.has_consented, false) = false and new.admin_id is not null then
    insert into public.notifications (user_id, type, message, url)
    values (
      new.admin_id,
      'client_consented',
      coalesce(new.first_name, 'A client') || ' agreed to your consent terms',
      '/admin/clients/' || new.id
    );
  end if;
  return new;
end;
$func$;

drop trigger if exists users_notify_admin_consented on public.users;
create trigger users_notify_admin_consented
  after update on public.users
  for each row execute function public.notify_admin_client_consented();

create or replace function public.notify_admin_manual_payment_pending()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_client_name text;
  v_block_id    text;
begin
  if new.manual_payment_status = 'pending'
     and coalesce(old.manual_payment_status, '') <> 'pending'
     and new.created_by is not null
  then
    v_block_id := new.metadata->>'block_id';

    -- request_manual_payment() updates every sibling in a block within the
    -- same statement, which would otherwise fire this trigger once per
    -- session and spam the admin with one notification per block session.
    -- Only the session with the lowest id in that block sends it — a
    -- deterministic pick independent of the UPDATE's row processing order.
    if v_block_id is not null and new.id <> (
      select min(id) from public.sessions
      where client_id = new.client_id and metadata->>'block_id' = v_block_id
    ) then
      return new;
    end if;

    select coalesce(first_name, 'A client') into v_client_name
    from public.users
    where id = new.client_id;

    insert into public.notifications (user_id, type, message, url)
    values (
      new.created_by,
      'manual_payment_pending',
      v_client_name || ' marked ' || case when v_block_id is not null then 'a block of sessions' else 'a session' end
        || ' as paid by bank transfer — needs your confirmation',
      '/admin/payments'
    );
  end if;
  return new;
end;
$func$;

drop trigger if exists sessions_notify_admin_manual_payment on public.sessions;
create trigger sessions_notify_admin_manual_payment
  after update on public.sessions
  for each row execute function public.notify_admin_manual_payment_pending();
