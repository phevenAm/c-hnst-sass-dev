-- ─────────────────────────────────────────────────────────────────────────────
-- Demo graph tags + Cassie sessions
-- New clients (Jordan/Priya/Marcus/Leila) are seeded via src/TEMP/seed-demo.mjs
-- which creates proper auth.users entries first (sessions FK requires it).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Fix demo tags RLS + add Sleep/Stress tags ─────────────────────────────
-- Old policy only allowed is_demo tags. Broaden to include tags referenced by
-- questions in demo questionnaires so the Mood/Sleep/Stress tags all resolve.

drop policy if exists "demo admins view demo tags" on public.tags;

create policy "demo admins view demo tags"
  on public.tags for select
  using (
    (select public.get_my_is_demo())
    and (
      is_demo = true
      or exists (
        select 1
        from public.questions q
        join public.questionnaires qn on qn.id = q.questionnaire_id
        where q.tag_id = tags.id and qn.is_demo = true
      )
    )
  );

insert into public.tags (id, name, is_demo, admin_id) values
  ('e1000000-0000-0000-0000-000000000002', 'Sleep',  false, '63aeb602-0056-4217-b120-9b6dc0c7c649'),
  ('e1000000-0000-0000-0000-000000000003', 'Stress', false, '63aeb602-0056-4217-b120-9b6dc0c7c649')
on conflict (id) do nothing;

-- Mood question → existing global Mood tag (e9bda384...)
update public.questions set tag_id = 'e9bda384-f406-4e94-b99e-bb5200665456'
  where id = '032153c8-cff6-4d2f-8b32-394622da6b8b';
update public.questions set tag_id = 'e1000000-0000-0000-0000-000000000002'
  where id = 'b439e04b-8b80-4f07-b1bc-94ea43536144';
update public.questions set tag_id = 'e1000000-0000-0000-0000-000000000003'
  where id = '4b40bac2-2875-4a3f-ac66-a39b3c2f9256';

-- ── 2. Sessions — Cassie (weekly Mondays 10:00, May → Aug) ───────────────────

insert into public.sessions (id, client_id, created_by, scheduled_at, duration_minutes, status, paid, attended, location, price_pence) values
  (gen_random_uuid(), '3d5e1d85-d7c6-4573-b61e-91d19daa07bb', '63aeb602-0056-4217-b120-9b6dc0c7c649', '2026-05-12 10:00:00+00', 50, 'completed', true,  true,  'remote',    6000),
  (gen_random_uuid(), '3d5e1d85-d7c6-4573-b61e-91d19daa07bb', '63aeb602-0056-4217-b120-9b6dc0c7c649', '2026-05-19 10:00:00+00', 50, 'completed', true,  true,  'remote',    6000),
  (gen_random_uuid(), '3d5e1d85-d7c6-4573-b61e-91d19daa07bb', '63aeb602-0056-4217-b120-9b6dc0c7c649', '2026-05-26 10:00:00+00', 50, 'cancelled', false, false, 'remote',    6000),
  (gen_random_uuid(), '3d5e1d85-d7c6-4573-b61e-91d19daa07bb', '63aeb602-0056-4217-b120-9b6dc0c7c649', '2026-06-02 10:00:00+00', 50, 'completed', true,  true,  'remote',    6000),
  (gen_random_uuid(), '3d5e1d85-d7c6-4573-b61e-91d19daa07bb', '63aeb602-0056-4217-b120-9b6dc0c7c649', '2026-06-09 10:00:00+00', 50, 'completed', true,  true,  'remote',    6000),
  (gen_random_uuid(), '3d5e1d85-d7c6-4573-b61e-91d19daa07bb', '63aeb602-0056-4217-b120-9b6dc0c7c649', '2026-06-16 10:00:00+00', 50, 'completed', true,  true,  'in_person', 6000),
  (gen_random_uuid(), '3d5e1d85-d7c6-4573-b61e-91d19daa07bb', '63aeb602-0056-4217-b120-9b6dc0c7c649', '2026-06-23 10:00:00+00', 50, 'completed', true,  true,  'in_person', 6000),
  (gen_random_uuid(), '3d5e1d85-d7c6-4573-b61e-91d19daa07bb', '63aeb602-0056-4217-b120-9b6dc0c7c649', '2026-06-30 10:00:00+00', 50, 'completed', true,  true,  'in_person', 6000),
  (gen_random_uuid(), '3d5e1d85-d7c6-4573-b61e-91d19daa07bb', '63aeb602-0056-4217-b120-9b6dc0c7c649', '2026-07-07 10:00:00+00', 50, 'completed', true,  true,  'remote',    6000),
  (gen_random_uuid(), '3d5e1d85-d7c6-4573-b61e-91d19daa07bb', '63aeb602-0056-4217-b120-9b6dc0c7c649', '2026-07-14 10:00:00+00', 50, 'completed', true,  true,  'remote',    6000),
  (gen_random_uuid(), '3d5e1d85-d7c6-4573-b61e-91d19daa07bb', '63aeb602-0056-4217-b120-9b6dc0c7c649', '2026-07-21 10:00:00+00', 50, 'completed', true,  true,  'remote',    6000),
  (gen_random_uuid(), '3d5e1d85-d7c6-4573-b61e-91d19daa07bb', '63aeb602-0056-4217-b120-9b6dc0c7c649', '2026-07-28 10:00:00+00', 50, 'completed', false, true,  'remote',    6000),
  (gen_random_uuid(), '3d5e1d85-d7c6-4573-b61e-91d19daa07bb', '63aeb602-0056-4217-b120-9b6dc0c7c649', '2026-08-11 10:00:00+00', 50, 'scheduled', false, false, 'remote',    6000),
  (gen_random_uuid(), '3d5e1d85-d7c6-4573-b61e-91d19daa07bb', '63aeb602-0056-4217-b120-9b6dc0c7c649', '2026-08-25 10:00:00+00', 50, 'scheduled', false, false, 'remote',    6000);
