-- ─────────────────────────────────────────────────────────────────────────────
-- Overlap guard was re-running on every UPDATE, not just scheduling changes
--
-- check_session_overlap / check_stub_session_overlap (20260903000000) fire
-- BEFORE INSERT OR UPDATE FOR EACH ROW with no filter on which columns
-- changed. So a plain "Mark paid" / "Mark unpaid" click on AdminPaymentsPage
-- (.update({ paid: true }) — scheduled_at, duration_minutes, status,
-- client_id all untouched) re-validates the row's time slot against the
-- whole practice calendar every time.
--
-- That's fine for a row with no conflict. But any row that already sits in a
-- genuinely overlapping slot — e.g. two block-booking rows created before
-- the practice-wide guard in 20260903000000 tightened what counts as a
-- conflict, or a real/offline pair that only became "the same practice" once
-- 20260830000000 started keying off the client's admin_id instead of
-- created_by — becomes permanently stuck: every future UPDATE re-finds the
-- same pre-existing conflict and gets rejected with "This time overlaps with
-- another session (including offline-client sessions) for this practice",
-- even though the write never touched scheduling. From the admin's side this
-- reads as the app refusing to let a session be marked paid at all.
--
-- Fix: only run the conflict check when a column that actually affects the
-- slot or its practice attribution is changing. Any other update (paid,
-- amount_paid, notes, manual_payment_status, …) passes straight through.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.check_session_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_practice_admin uuid;
begin
  -- Not a scheduling-relevant change — nothing to re-validate.
  if TG_OP = 'UPDATE'
     and new.scheduled_at is not distinct from old.scheduled_at
     and new.duration_minutes is not distinct from old.duration_minutes
     and new.status is not distinct from old.status
     and new.client_id is not distinct from old.client_id
     and new.created_by is not distinct from old.created_by
  then
    return new;
  end if;

  -- Cancelled sessions don't hold a slot.
  if new.status = 'cancelled' then
    return new;
  end if;

  -- The practice is the client's owning admin; created_by is only a fallback
  -- for rows whose client has no admin_id yet.
  select u.admin_id into v_practice_admin
  from public.users u
  where u.id = new.client_id;

  v_practice_admin := coalesce(v_practice_admin, new.created_by);

  -- Genuinely can't place this row in a practice — let it through rather than
  -- block on incomplete data.
  if v_practice_admin is null then
    return new;
  end if;

  if public._practice_slot_has_conflict_all(
       v_practice_admin,
       new.scheduled_at,
       coalesce(new.duration_minutes, 50),
       new.id,
       null
     ) then
    raise exception
      'This time overlaps with another session (including offline-client sessions) for this practice';
  end if;

  return new;
end;
$func$;

create or replace function public.check_stub_session_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
begin
  -- Not a scheduling-relevant change — nothing to re-validate.
  if TG_OP = 'UPDATE'
     and new.scheduled_at is not distinct from old.scheduled_at
     and new.duration_minutes is not distinct from old.duration_minutes
     and new.status is not distinct from old.status
     and new.admin_id is not distinct from old.admin_id
  then
    return new;
  end if;

  if new.status <> 'scheduled' then
    return new;
  end if;

  if public._practice_slot_has_conflict_all(
       new.admin_id,
       new.scheduled_at,
       coalesce(new.duration_minutes, 50),
       null,
       new.id
     ) then
    raise exception 'This time overlaps with another session for this practice';
  end if;

  return new;
end;
$func$;

-- Triggers prevent_session_double_booking / prevent_stub_session_double_booking
-- pick up the new function bodies automatically.
