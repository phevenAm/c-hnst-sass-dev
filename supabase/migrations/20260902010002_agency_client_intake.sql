-- ─────────────────────────────────────────────────────────────────────────────
-- Agencies, part 3 of 5: client intake + assignment.
--
-- A manager creates a client as an OFFLINE record (public.client_stubs, the
-- existing shadow-client machinery) carrying intake notes, one default session
-- rate, and a free-text availability note. It sits in the agency's unassigned
-- pool until the manager assigns it to a member admin and that admin ACCEPTS.
--
--   * client_stubs gets: agency_id, default_rate_pence, availability_note
--   * client_assignments: one row per assign attempt (pending → accepted/declined)
--   * respond_to_agency_assignment(): the admin's accept / decline, which
--     transfers stub ownership (client_stubs.created_by) on accept
--
-- Stub creation itself needs no special handling: client_stubs.created_by
-- defaults to auth.uid(), so a manager creating one owns it under the existing
-- "admins can manage client stubs" policy until it's accepted away.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.client_stubs
  add column if not exists agency_id         uuid references public.agencies(id) on delete set null,
  add column if not exists default_rate_pence integer,
  add column if not exists availability_note  text;

create index if not exists client_stubs_agency_id_idx on public.client_stubs (agency_id);

-- ── client_assignments ─────────────────────────────────────────────────────
create table if not exists public.client_assignments (
  id               uuid        primary key default gen_random_uuid(),
  stub_id          uuid        not null references public.client_stubs(id) on delete cascade,
  agency_id        uuid        not null references public.agencies(id) on delete cascade,
  from_manager_id  uuid        not null references auth.users(id) on delete set null,
  to_admin_id      uuid        not null references auth.users(id) on delete cascade,
  status           text        not null default 'pending'
                               check (status in ('pending', 'accepted', 'declined')),
  rate_pence       integer,
  availability_note text,
  intake_note      text,
  decline_reason   text,
  created_at       timestamptz not null default now(),
  responded_at     timestamptz
);

create index if not exists client_assignments_stub_idx     on public.client_assignments (stub_id);
create index if not exists client_assignments_to_admin_idx  on public.client_assignments (to_admin_id, status);
create index if not exists client_assignments_agency_idx    on public.client_assignments (agency_id, status);

-- Only one live (pending or accepted) assignment per stub at a time.
create unique index if not exists client_assignments_one_live_per_stub
  on public.client_assignments (stub_id)
  where status in ('pending', 'accepted');

alter table public.client_assignments enable row level security;

do $func$
begin
  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='client_assignments'
      and policyname='managers manage agency assignments') then
    execute $pol$
      create policy "managers manage agency assignments" on public.client_assignments
        for all to authenticated
        using (agency_id = public.current_agency_id() and public.is_agency_manager())
        with check (agency_id = public.current_agency_id() and public.is_agency_manager())
    $pol$;
  end if;

  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='client_assignments'
      and policyname='assigned admin reads own assignments') then
    execute $pol$
      create policy "assigned admin reads own assignments" on public.client_assignments
        for select to authenticated
        using (to_admin_id = auth.uid())
    $pol$;
  end if;
end $func$;

grant select, insert, update, delete on public.client_assignments to authenticated;

-- While an intake is assigned to a counsellor (pending OR accepted) they can
-- read the stub itself — needed for the review screen, since the stub is still
-- owned by the manager (created_by) until they accept. Permissive, ORs with the
-- existing "admins can manage client stubs" rule.
do $func$
begin
  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='client_stubs'
      and policyname='assigned counsellor reads intake stub') then
    execute $pol$
      create policy "assigned counsellor reads intake stub" on public.client_stubs
        for select to authenticated
        using (exists (
          select 1 from public.client_assignments ca
          where ca.stub_id = client_stubs.id
            and ca.to_admin_id = auth.uid()
            and ca.status in ('pending', 'accepted')
        ))
    $pol$;
  end if;
end $func$;

-- ── respond_to_agency_assignment(id, accept, decline_reason) ────────────────
-- Runs as the target admin. Accept → stamp accepted + move the stub into the
-- admin's caseload (client_stubs.created_by). Decline → stamp declined; the
-- stub stays with the manager, back in the pool.
create or replace function public.respond_to_agency_assignment(
  p_assignment_id uuid,
  p_accept        boolean,
  p_decline_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_uid    uuid := auth.uid();
  v_stub   uuid;
  v_target uuid;
  v_status text;
  v_rate   integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select stub_id, to_admin_id, status, rate_pence
    into v_stub, v_target, v_status, v_rate
  from public.client_assignments
  where id = p_assignment_id;

  if not found then
    raise exception 'Assignment not found';
  end if;
  if v_target <> v_uid then
    raise exception 'Not your assignment to respond to';
  end if;
  if v_status <> 'pending' then
    raise exception 'Assignment already %', v_status;
  end if;

  if p_accept then
    update public.client_assignments
      set status = 'accepted', responded_at = now()
      where id = p_assignment_id;

    update public.client_stubs
      set created_by = v_uid,
          default_rate_pence = coalesce(v_rate, default_rate_pence)
      where id = v_stub;
  else
    update public.client_assignments
      set status = 'declined', responded_at = now(), decline_reason = p_decline_reason
      where id = p_assignment_id;
  end if;
end;
$func$;

revoke execute on function public.respond_to_agency_assignment(uuid, boolean, text) from anon;
grant  execute on function public.respond_to_agency_assignment(uuid, boolean, text) to authenticated;
