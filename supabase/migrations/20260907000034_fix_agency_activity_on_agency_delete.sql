-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: deleting an agency blew up on its own activity trigger.
--
-- agencies -> agency_members is ON DELETE CASCADE. Deleting an agency cascades
-- to its members, which fires trg_agency_members_activity()'s DELETE branch,
-- which calls log_agency_event(old.agency_id, ...) — but the parent agencies
-- row is already gone in the same statement, so the insert into
-- agency_activity_events violates agency_activity_events_agency_id_fkey.
--
-- Guard the DELETE branch: if the agency itself no longer exists, there's
-- nothing to log a "member removed" against — skip it. A genuine single-member
-- removal (agency stays) still logs as before.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.trg_agency_members_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_name  text;
  v_owner uuid;
begin
  if tg_op = 'INSERT' then
    v_name := public._person_name(new.user_id);
    select owner_id into v_owner from public.agencies where id = new.agency_id;
    if new.user_id = v_owner then
      perform public.log_agency_event(new.agency_id, new.user_id, 'agency.created',
        'member', new.user_id::text, v_name || ' created the agency', '{}'::jsonb);
    else
      perform public.log_agency_event(new.agency_id, new.user_id, 'member.joined',
        'member', new.user_id::text,
        v_name || ' joined as ' || new.role
          || case when new.agreement_accepted_at is not null then ' and signed the working agreement' else '' end,
        jsonb_build_object('role', new.role, 'employment_type', new.employment_type));
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_name := public._person_name(new.user_id);

    if new.role is distinct from old.role then
      perform public.log_agency_event(new.agency_id, auth.uid(), 'member.role_changed',
        'member', new.user_id::text,
        v_name || ' changed from ' || old.role || ' to ' || new.role,
        jsonb_build_object('from', old.role, 'to', new.role));
    end if;

    if new.status is distinct from old.status then
      perform public.log_agency_event(new.agency_id, auth.uid(),
        case when new.status = 'active' then 'member.reenabled' else 'member.disabled' end,
        'member', new.user_id::text,
        v_name || case when new.status = 'active' then ' was re-enabled' else ' was disabled' end, '{}'::jsonb);
    end if;

    if old.agreement_accepted_at is null and new.agreement_accepted_at is not null then
      perform public.log_agency_event(new.agency_id, new.user_id, 'agreement.signed',
        'member', new.user_id::text,
        v_name || ' signed the working agreement (v' || coalesce(new.agreement_accepted_version, 1) || ')',
        jsonb_build_object('version', new.agreement_accepted_version, 'signed_name', new.agreement_signed_name));
    end if;

    if new.settlement_direction is distinct from old.settlement_direction then
      perform public.log_agency_event(new.agency_id, auth.uid(), 'settlement.changed',
        'member', new.user_id::text,
        'Payment direction for ' || v_name || ' set to '
          || coalesce(new.settlement_direction, 'the agency default'),
        jsonb_build_object('from', old.settlement_direction, 'to', new.settlement_direction));
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    -- Parent agency gone already (cascade delete of the whole agency) — nothing
    -- to attach a "member removed" event to.
    if not exists (select 1 from public.agencies where id = old.agency_id) then
      return old;
    end if;
    perform public.log_agency_event(old.agency_id, auth.uid(), 'member.removed',
      'member', old.user_id::text,
      public._person_name(old.user_id) || ' was removed from the agency', '{}'::jsonb);
    return old;
  end if;

  return null;
end;
$func$;

notify pgrst, 'reload schema';
