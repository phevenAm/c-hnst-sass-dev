-- ─────────────────────────────────────────────────────────────────────────────
-- Agency staff sharing & creation permissions.
--
-- Three additive pieces, all opt-in (safe defaults, byte-for-byte unchanged
-- behaviour for every non-agency admin and for agencies that don't touch the
-- new settings):
--
--   A. Staff can be given permission to CREATE their own forms/resources.
--      agencies.allow_staff_forms / allow_staff_resources (default false —
--      the manager must explicitly turn this on). Enforced as a RESTRICTIVE
--      INSERT-only policy so it can never loosen who can SELECT/UPDATE/DELETE
--      a row someone already owns, and never touches the existing "own it"
--      policies at all.
--
--   B. Staff can read (and assign to their own clients) resources their
--      agency's manager has published, when agencies.shared_resources is on
--      (existing column, previously captured but unused — see
--      20260902010000's header comment). New SELECT-only policy on
--      `resources`, additive/permissive, via a fresh helper function that
--      only ever queries agencies/agency_members — it does NOT touch
--      questionnaires/questionnaire_assignments, so it can't reproduce the
--      infinite-recursion bug fixed in 20260902010006 (that bug was a mutual
--      policy reference between two tables; this is a one-way read against
--      unrelated tables).
--
--      Forms are deliberately NOT given the equivalent SELECT widening here —
--      that family already bit prod once (20260902010006) and deserves its
--      own dedicated pass with staging verification, not a tail-end add.
--      allow_staff_forms above only gates creation, not reading a manager's
--      forms.
--
--   C. file_folders/file_objects gain shared_internal / shared_freelance
--      (both default true, so any row already marked `shared = true` keeps
--      behaving exactly as it does today — visible to any staff type). A
--      manager can now scope a shared folder/file to just employees, just
--      freelance/associate staff, or both. Replaces the flat "shared to the
--      whole agency" read check with one that also matches the caller's own
--      employment_type.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── A. Creation permission toggles ─────────────────────────────────────────
alter table public.agencies
  add column if not exists allow_staff_forms     boolean not null default false,
  add column if not exists allow_staff_resources boolean not null default false;

comment on column public.agencies.allow_staff_forms is
  'When true, non-manager staff may create their own questionnaires/forms (always allowed for managers).';
comment on column public.agencies.allow_staff_resources is
  'When true, non-manager staff may create their own resources (always allowed for managers).';

create or replace function public.agency_may_create(p_owner uuid, p_allow_column text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $func$
declare
  v_agency  uuid;
  v_manager boolean;
  v_allowed boolean;
begin
  if p_owner is distinct from auth.uid() then
    return false; -- the base ownership policy already requires this; belt & braces
  end if;

  select am.agency_id, am.role = 'manager'
    into v_agency, v_manager
    from public.agency_members am
   where am.user_id = p_owner and am.status = 'active';

  if v_agency is null or v_manager then
    return true; -- not in an agency, or a manager: always allowed
  end if;

  execute format('select %I from public.agencies where id = $1', p_allow_column)
    into v_allowed using v_agency;
  return coalesce(v_allowed, false);
end;
$func$;

revoke all on function public.agency_may_create(uuid, text) from public, anon;
grant execute on function public.agency_may_create(uuid, text) to authenticated;

drop policy if exists "agency staff forms create permission" on public.questionnaires;
create policy "agency staff forms create permission" on public.questionnaires
  as restrictive for insert to authenticated
  with check (public.agency_may_create(admin_id, 'allow_staff_forms'));

drop policy if exists "agency staff resources create permission" on public.resources;
create policy "agency staff resources create permission" on public.resources
  as restrictive for insert to authenticated
  with check (public.agency_may_create(admin_id, 'allow_staff_resources'));

-- ── B. Staff inherit the agency's shared resource library (read-only) ──────
create or replace function public.agency_shares_resources(p_owner uuid)
returns boolean
language sql stable security definer set search_path = ''
as $func$
  select exists (
    select 1
      from public.agency_members mine
      join public.agency_members owner_mem
        on owner_mem.agency_id = mine.agency_id
       and owner_mem.user_id   = p_owner
       and owner_mem.role      = 'manager'
      join public.agencies a on a.id = mine.agency_id
     where mine.user_id = auth.uid()
       and mine.status  = 'active'
       and a.shared_resources
  );
$func$;

revoke all on function public.agency_shares_resources(uuid) from public, anon;
grant execute on function public.agency_shares_resources(uuid) to authenticated;

drop policy if exists "staff read agency shared resources" on public.resources;
create policy "staff read agency shared resources" on public.resources for select to authenticated
  using (public.agency_shares_resources(admin_id));

-- ── C. Folder/file sharing scoped to internal vs. freelance staff ─────────
alter table public.file_folders
  add column if not exists shared_internal  boolean not null default true,
  add column if not exists shared_freelance boolean not null default true;
alter table public.file_objects
  add column if not exists shared_internal  boolean not null default true,
  add column if not exists shared_freelance boolean not null default true;

comment on column public.file_folders.shared_internal is
  'When shared=true: also visible to internal (employee) staff. Default true preserves pre-existing shared rows.';
comment on column public.file_folders.shared_freelance is
  'When shared=true: also visible to freelance/associate staff. Default true preserves pre-existing shared rows.';
comment on column public.file_objects.shared_internal  is 'See file_folders.shared_internal.';
comment on column public.file_objects.shared_freelance is 'See file_folders.shared_freelance.';

create or replace function public.file_shared_with_caller(
  p_agency_id uuid, p_shared boolean, p_shared_internal boolean, p_shared_freelance boolean
)
returns boolean
language sql stable security definer set search_path = ''
as $func$
  select p_shared
     and p_agency_id is not null
     and p_agency_id = public.current_agency_id()
     and (
       public.is_agency_manager()
       or exists (
         select 1 from public.agency_members am
          where am.user_id = auth.uid()
            and am.status  = 'active'
            and ((am.employment_type = 'employee'  and p_shared_internal)
              or (am.employment_type = 'freelance' and p_shared_freelance))
       )
     );
$func$;

revoke all on function public.file_shared_with_caller(uuid, boolean, boolean, boolean) from public, anon;
grant execute on function public.file_shared_with_caller(uuid, boolean, boolean, boolean) to authenticated;

drop policy if exists "file_folders read" on public.file_folders;
create policy "file_folders read" on public.file_folders for select to authenticated
  using (
    owner_admin_id = auth.uid()
    or public.acts_for_admin(owner_admin_id)
    or public.file_shared_with_caller(agency_id, shared, shared_internal, shared_freelance)
  );

drop policy if exists "file_objects read" on public.file_objects;
create policy "file_objects read" on public.file_objects for select to authenticated
  using (
    owner_admin_id = auth.uid()
    or public.acts_for_admin(owner_admin_id)
    or public.file_shared_with_caller(agency_id, shared, shared_internal, shared_freelance)
  );

notify pgrst, 'reload schema';
