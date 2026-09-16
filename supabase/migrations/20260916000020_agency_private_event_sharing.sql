-- ─────────────────────────────────────────────────────────────────────────────
-- Agency staff creating a private calendar block (holiday, admin time,
-- unavailability) can opt to let their agency manager know about it — a
-- checkbox on the block, off by default (nothing changes for anyone who
-- doesn't tick it, and nothing changes at all for a non-agency admin).
--
-- Ticking it does two things when the block is newly marked shared:
--   1. An in-app notification (public.notifications, already realtime-
--      enabled — this is the "toast" the user asked for; NotificationBell
--      already renders these) for every active manager of the creator's
--      agency.
--   2. An email to those same managers, via a new edge function
--      (notify-agency-private-event-shared), fired the same way
--      file-orphan-sweep already does from SQL (net.http_post + an internal
--      secret header) — not a cron job, a direct call from the trigger.
--
-- Deliberately NOT added: rendering these on the agency sessions calendar.
-- That's a real product decision (would it show as a plain "unavailable"
-- block, with or without the title?) that wasn't asked for explicitly —
-- notification-only for now.
-- ─────────────────────────────────────────────────────────────────────────────

-- Placeholder Vault secret so a fresh `db reset` has a row under this name —
-- same pattern as internal_reminder_secret (20260828000001). The real value
-- is NOT in this file; set out of band via Vault + `supabase secrets set`.
select vault.create_secret(
  'placeholder-set-via-supabase-secrets-and-vault',
  'internal_agency_private_event_secret',
  'x-internal-secret for calls to the notify-agency-private-event-shared edge function'
) where not exists (select 1 from vault.secrets where name = 'internal_agency_private_event_secret');

alter table public.admin_private_events
  add column if not exists share_with_agency boolean not null default false;

comment on column public.admin_private_events.share_with_agency is
  'When true, the creator''s agency manager(s) were notified (in-app + email) about this block.';

create or replace function public.notify_agency_of_shared_private_event()
returns trigger
language plpgsql security definer set search_path = ''
as $func$
declare
  v_agency_id uuid;
  v_creator_name text;
  v_manager record;
begin
  if not new.share_with_agency then
    return new;
  end if;
  -- Only notify on a genuinely NEW share (insert, or an update that just
  -- turned it on) — never re-notify on every subsequent edit of an already-
  -- shared block.
  if tg_op = 'UPDATE' and old.share_with_agency then
    return new;
  end if;

  select am.agency_id into v_agency_id
    from public.agency_members am
   where am.user_id = new.admin_id and am.status = 'active';
  if v_agency_id is null then
    return new; -- not an agency member — nothing to notify
  end if;

  select coalesce(u.display_name, trim(u.first_name || ' ' || u.last_name), 'A staff member')
    into v_creator_name
    from public.users u where u.id = new.admin_id;

  for v_manager in
    select am.user_id from public.agency_members am
     where am.agency_id = v_agency_id and am.role = 'manager' and am.status = 'active'
       and am.user_id <> new.admin_id
  loop
    insert into public.notifications (user_id, type, message)
    values (
      v_manager.user_id,
      'agency_private_event_shared',
      v_creator_name || ' shared a calendar block with you: "' || new.title || '"'
    );

    perform net.http_post(
      url     := 'https://mxyfdvfbdrusbjiozuzx.supabase.co/functions/v1/notify-agency-private-event-shared',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'internal_agency_private_event_secret')
      ),
      body    := jsonb_build_object(
        'manager_id', v_manager.user_id,
        'creator_name', v_creator_name,
        'event_title', new.title,
        'starts_at', new.starts_at,
        'ends_at', new.ends_at
      )
    );
  end loop;

  return new;
end;
$func$;

drop trigger if exists admin_private_events_10_notify_agency on public.admin_private_events;
create trigger admin_private_events_10_notify_agency
  after insert or update of share_with_agency on public.admin_private_events
  for each row execute function public.notify_agency_of_shared_private_event();

notify pgrst, 'reload schema';
