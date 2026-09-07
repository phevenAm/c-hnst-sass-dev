-- ─────────────────────────────────────────────────────────────────────────────
-- Agency activity log.
--
-- A manager-only feed at /agency/activity that merges TWO sources:
--
--   1. Member activity — every active member's public.audit_logs rows
--      (client / session / payment / form / note actions). Read cross-member
--      only through the SECURITY DEFINER RPC below; audit_logs RLS itself stays
--      "actor_id = auth.uid()" so a counsellor never sees a peer's log.
--
--   2. Agency governance events — public.agency_activity_events, written by the
--      triggers here: staff invited / joined / role changed / disabled /
--      removed, working agreement signed, client intake created / assigned /
--      accepted / declined, agency policy + agreement + settlement changes,
--      agency invoices raised / sent / paid.
--
-- public.agency_activity_feed(member, before, since, limit) unions the two into
-- one shape, newest first, with an optional single-member filter and date range.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── events table ───────────────────────────────────────────────────────────
create table if not exists public.agency_activity_events (
  id           uuid        primary key default gen_random_uuid(),
  agency_id    uuid        not null references public.agencies(id) on delete cascade,
  actor_id     uuid        references auth.users(id) on delete set null,
  event_type   text        not null,
  subject_type text,
  subject_id   text,
  summary      text        not null,
  meta         jsonb       not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists agency_activity_events_agency_idx
  on public.agency_activity_events (agency_id, created_at desc);
create index if not exists agency_activity_events_actor_idx
  on public.agency_activity_events (actor_id);

alter table public.agency_activity_events enable row level security;

-- Managers read their own agency's events. No INSERT/UPDATE/DELETE policy —
-- rows are written only by the SECURITY DEFINER trigger functions below.
drop policy if exists "managers read agency activity" on public.agency_activity_events;
create policy "managers read agency activity"
  on public.agency_activity_events for select
  to authenticated
  using (agency_id = public.current_agency_id() and public.is_agency_manager());

grant select on public.agency_activity_events to authenticated;
revoke insert, update, delete on public.agency_activity_events from authenticated, anon;

-- ── helpers ────────────────────────────────────────────────────────────────
create or replace function public._person_name(p_uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $func$
  select coalesce(
    nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''),
    display_name,
    'Someone'
  )
  from public.users
  where id = p_uid;
$func$;

create or replace function public.log_agency_event(
  p_agency uuid, p_actor uuid, p_type text,
  p_subject_type text, p_subject_id text, p_summary text,
  p_meta jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public
as $func$
  insert into public.agency_activity_events
    (agency_id, actor_id, event_type, subject_type, subject_id, summary, meta)
  values
    (p_agency, p_actor, p_type, p_subject_type, p_subject_id, p_summary, coalesce(p_meta, '{}'::jsonb));
$func$;

revoke execute on function public._person_name(uuid) from anon;
revoke execute on function public.log_agency_event(uuid, uuid, text, text, text, text, jsonb) from anon, authenticated;

-- ── trigger: agency_members ───────────────────────────────────────────────
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
    perform public.log_agency_event(old.agency_id, auth.uid(), 'member.removed',
      'member', old.user_id::text,
      public._person_name(old.user_id) || ' was removed from the agency', '{}'::jsonb);
    return old;
  end if;

  return null;
end;
$func$;

drop trigger if exists agency_members_activity on public.agency_members;
create trigger agency_members_activity
  after insert or update or delete on public.agency_members
  for each row execute function public.trg_agency_members_activity();

-- ── trigger: client_stubs (agency intake only) ───────────────────────────
create or replace function public.trg_agency_intake_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_who text;
begin
  if new.agency_id is null then
    return new;                       -- ordinary shadow client, not agency intake
  end if;
  v_who := coalesce(new.codename, nullif(trim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, '')), ''),
                    'a new client');
  perform public.log_agency_event(new.agency_id, new.created_by, 'intake.created',
    'client', new.id::text, 'New intake added to the pool: ' || v_who, '{}'::jsonb);
  return new;
end;
$func$;

drop trigger if exists agency_intake_activity on public.client_stubs;
create trigger agency_intake_activity
  after insert on public.client_stubs
  for each row execute function public.trg_agency_intake_activity();

-- ── trigger: client_assignments ──────────────────────────────────────────
create or replace function public.trg_agency_assignment_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_client   text;
  v_to_name  text;
begin
  select coalesce(cs.codename, nullif(trim(coalesce(cs.first_name, '') || ' ' || coalesce(cs.last_name, '')), ''),
                  'a client')
    into v_client
  from public.client_stubs cs where cs.id = coalesce(new.stub_id, old.stub_id);

  if tg_op = 'INSERT' then
    v_to_name := public._person_name(new.to_admin_id);
    perform public.log_agency_event(new.agency_id, new.from_manager_id, 'intake.assigned',
      'client', new.stub_id::text,
      v_client || ' assigned to ' || v_to_name,
      jsonb_build_object('to_admin_id', new.to_admin_id, 'rate_pence', new.rate_pence));
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status
     and new.status in ('accepted', 'declined') then
    v_to_name := public._person_name(new.to_admin_id);
    perform public.log_agency_event(new.agency_id, new.to_admin_id,
      'intake.' || new.status, 'client', new.stub_id::text,
      v_to_name || ' ' || new.status || ' ' || v_client
        || case when new.status = 'declined' and new.decline_reason is not null
                then ' (' || new.decline_reason || ')' else '' end,
      jsonb_build_object('status', new.status, 'decline_reason', new.decline_reason));
    return new;
  end if;

  return new;
end;
$func$;

drop trigger if exists agency_assignment_activity on public.client_assignments;
create trigger agency_assignment_activity
  after insert or update on public.client_assignments
  for each row execute function public.trg_agency_assignment_activity();

-- ── trigger: agencies (policy / agreement / settlement switches) ─────────
create or replace function public.trg_agency_policy_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_actor uuid := auth.uid();
  old_j   jsonb := to_jsonb(old);
  new_j   jsonb := to_jsonb(new);
  sw      text;
  v_label text;
  labels  jsonb := jsonb_build_object(
    'locked_consent',           'Client consent lock',
    'shared_resources',         'Shared resource library',
    'require_note_encryption',  'Mandatory note encryption',
    'locked_email_templates',   'Locked email templates',
    'require_client_codenames', 'Mandatory client codenames',
    'staff_agreement_required', 'Staff working-agreement requirement'
  );
begin
  foreach sw in array array[
    'locked_consent', 'shared_resources', 'require_note_encryption',
    'locked_email_templates', 'require_client_codenames', 'staff_agreement_required'
  ]
  loop
    if (new_j ->> sw) is distinct from (old_j ->> sw) then
      v_label := labels ->> sw;
      perform public.log_agency_event(new.id, v_actor, 'policy.changed', 'agency', new.id::text,
        v_label || ' ' || case when (new_j ->> sw)::boolean then 'turned on' else 'turned off' end,
        jsonb_build_object('switch', sw, 'value', (new_j ->> sw)::boolean));
    end if;
  end loop;

  if new.agreement_text is distinct from old.agreement_text
     or new.agreement_pdf_url is distinct from old.agreement_pdf_url then
    perform public.log_agency_event(new.id, v_actor, 'agreement.changed', 'agency', new.id::text,
      'Working agreement updated (now v' || new.agreement_version || ')', '{}'::jsonb);
  end if;

  if new.consent_text is distinct from old.consent_text then
    perform public.log_agency_event(new.id, v_actor, 'policy.changed', 'agency', new.id::text,
      'Agency client-consent text updated', '{}'::jsonb);
  end if;

  if new.default_settlement_direction is distinct from old.default_settlement_direction then
    perform public.log_agency_event(new.id, v_actor, 'settlement.changed', 'agency', new.id::text,
      'Default payment direction set to ' || new.default_settlement_direction,
      jsonb_build_object('from', old.default_settlement_direction, 'to', new.default_settlement_direction));
  end if;

  if new.subscription_plan is distinct from old.subscription_plan then
    perform public.log_agency_event(new.id, v_actor, 'plan.changed', 'agency', new.id::text,
      'Agency plan changed from ' || old.subscription_plan || ' to ' || new.subscription_plan,
      jsonb_build_object('from', old.subscription_plan, 'to', new.subscription_plan));
  end if;

  return new;
end;
$func$;

drop trigger if exists agency_policy_activity on public.agencies;
create trigger agency_policy_activity
  after update on public.agencies
  for each row execute function public.trg_agency_policy_activity();

-- ── trigger: agency_invoices ─────────────────────────────────────────────
create or replace function public.trg_agency_invoice_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_staff text;
  v_amt   text;
  v_dir   text;
begin
  v_staff := public._person_name(coalesce(new.staff_user_id, old.staff_user_id));
  v_amt   := '£' || to_char(coalesce(new.amount_pence, 0) / 100.0, 'FM999999990.00');
  v_dir   := case coalesce(new.direction, 'staff_to_agency')
               when 'agency_to_staff' then 'agency → ' || v_staff
               else v_staff || ' → agency' end;

  if tg_op = 'INSERT' then
    perform public.log_agency_event(new.agency_id, new.issued_by, 'invoice.raised',
      'invoice', new.id::text,
      'Invoice ' || new.reference || ' raised (' || v_dir || ', ' || v_amt || ')',
      jsonb_build_object('reference', new.reference, 'amount_pence', new.amount_pence,
                         'direction', new.direction, 'status', new.status));
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'sent' then
      perform public.log_agency_event(new.agency_id, auth.uid(), 'invoice.sent',
        'invoice', new.id::text, 'Invoice ' || new.reference || ' sent to ' || v_staff, '{}'::jsonb);
    elsif new.status = 'paid' then
      perform public.log_agency_event(new.agency_id, auth.uid(), 'invoice.paid',
        'invoice', new.id::text,
        'Invoice ' || new.reference || ' marked paid (' || v_amt
          || coalesce(', ' || new.payment_method, '') || ')',
        jsonb_build_object('reference', new.reference, 'amount_pence', new.amount_pence,
                           'payment_method', new.payment_method));
    elsif new.status = 'cancelled' then
      perform public.log_agency_event(new.agency_id, auth.uid(), 'invoice.cancelled',
        'invoice', new.id::text, 'Invoice ' || new.reference || ' cancelled', '{}'::jsonb);
    end if;
  end if;

  return new;
end;
$func$;

drop trigger if exists agency_invoice_activity on public.agency_invoices;
create trigger agency_invoice_activity
  after insert or update on public.agency_invoices
  for each row execute function public.trg_agency_invoice_activity();

-- ── The merged feed (manager only) ───────────────────────────────────────
create or replace function public.agency_activity_feed(
  p_member uuid        default null,
  p_before timestamptz default null,
  p_since  timestamptz default null,
  p_limit  integer     default 100
)
returns table (
  source     text,
  event_time timestamptz,
  actor_id   uuid,
  actor_name text,
  category   text,
  summary    text,
  detail     jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $func$
declare
  v_agency uuid := public.current_agency_id();
  v_lim    integer := greatest(1, least(coalesce(p_limit, 100), 500));
begin
  if v_agency is null or not public.is_agency_manager() then
    raise exception 'Not an agency manager';
  end if;

  return query
  with member_ids as (
    select am.user_id
    from public.agency_members am
    where am.agency_id = v_agency
      and am.status = 'active'
      and (p_member is null or am.user_id = p_member)
  )
  select * from (
    select
      'member'::text as source,
      al.created_at  as event_time,
      al.actor_id,
      public._person_name(al.actor_id) as actor_name,
      al.table_name  as category,
      (case al.action when 'INSERT' then 'Added ' when 'UPDATE' then 'Updated ' else 'Removed ' end
        || replace(al.table_name, '_', ' ')) as summary,
      jsonb_build_object('action', al.action, 'record_id', al.record_id,
                         'old', al.old_data, 'new', al.new_data) as detail
    from public.audit_logs al
    join member_ids mi on mi.user_id = al.actor_id
    where (p_before is null or al.created_at < p_before)
      and (p_since  is null or al.created_at >= p_since)

    union all

    select
      'agency'::text,
      e.created_at,
      e.actor_id,
      coalesce(public._person_name(e.actor_id), 'Agency'),
      e.event_type,
      e.summary,
      e.meta
    from public.agency_activity_events e
    where e.agency_id = v_agency
      and (p_member is null or e.actor_id = p_member)
      and (p_before is null or e.created_at < p_before)
      and (p_since  is null or e.created_at >= p_since)
  ) merged
  order by event_time desc
  limit v_lim;
end;
$func$;

revoke execute on function public.agency_activity_feed(uuid, timestamptz, timestamptz, integer) from anon;
grant  execute on function public.agency_activity_feed(uuid, timestamptz, timestamptz, integer) to authenticated;

notify pgrst, 'reload schema';
