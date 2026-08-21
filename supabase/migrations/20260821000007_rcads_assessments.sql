-- RCADS (Revised Children's Anxiety and Depression Scale — Child version):
-- Chorpita, Yim, Moffitt, Umemoto & Francis (2000), Behaviour Research and
-- Therapy, 38, 835-855. A 47-item client-facing outcome measure, deliberately
-- NOT modelled on the generic questionnaires/questions/responses engine —
-- its scoring (age/gender-normed T-scores per subscale, prorated for up to
-- 2 missing items, clinical banding at T>=65/70) doesn't fit that engine's
-- plain sum/average scoring, so it gets its own table and a dedicated
-- scoring module (src/Helpers/rcadsScoring.ts) instead.
--
-- date_of_birth (not age or US "grade") is what the client actually enters;
-- the scoring module maps age-at-submission to the nearest of the norm
-- table's five 2-year grade-bands (3-4, 5-6, 7-8, 9-10, 11-12) itself.
--
-- answers is a jsonb array of 47 integers (0-3, index 0 = item 1) rather
-- than 47 columns — nothing here needs to filter or aggregate by individual
-- item at the database level, only the scoring module ever reads it, and a
-- single jsonb column keeps this migration (and any future scale added the
-- same way) simple.
create table public.rcads_assessments (
  id            uuid        primary key default gen_random_uuid(),
  admin_id      uuid        not null references auth.users(id) on delete cascade,
  client_id     uuid        not null references auth.users(id) on delete cascade,
  date_of_birth date        not null,
  gender        text        not null check (gender in ('boy', 'girl')),
  answers       jsonb       not null,
  submitted_at  timestamptz not null default now(),
  constraint rcads_answers_shape check (
    jsonb_typeof(answers) = 'array' and jsonb_array_length(answers) = 47
  )
);

-- admin_id is derived server-side from the submitting client's own
-- users.admin_id, not trusted from the insert payload — a client could
-- otherwise claim to belong to any admin.
create or replace function public.set_rcads_admin_id()
returns trigger
language plpgsql
security definer
as $func$
begin
  select admin_id into new.admin_id
  from public.users
  where id = new.client_id;

  if new.admin_id is null then
    raise exception 'client % has no admin_id set', new.client_id;
  end if;

  return new;
end;
$func$;

create trigger rcads_assessments_set_admin_id
  before insert on public.rcads_assessments
  for each row execute function public.set_rcads_admin_id();

alter table public.rcads_assessments enable row level security;

create policy "clients insert own rcads assessments"
  on public.rcads_assessments for insert
  with check (client_id = auth.uid());

create policy "clients view own rcads assessments"
  on public.rcads_assessments for select
  using (client_id = auth.uid());

create policy "admins manage own clients' rcads assessments"
  on public.rcads_assessments for all
  using (admin_id = auth.uid());

create index rcads_assessments_client_idx on public.rcads_assessments (client_id, submitted_at desc);
