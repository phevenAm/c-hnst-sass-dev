-- The demo client's weekly check-in questionnaire (id 724dc304-...,
-- referenced by 20260804000003_demo_checkins.sql) doesn't exist on this
-- database — confirmed live: no row in questionnaires/questions/
-- questionnaire_assignments for that id, and the "Mood" tag it depended on
-- (e9bda384-...) is also missing. That base scaffolding was originally set
-- up directly against the database (not a tracked migration) and was lost
-- at some point (project reset), while later migrations that only added
-- *more* rows on top of it (more responses, the Sleep/Stress tags) survived
-- because they were tracked — hence Sleep/Stress already exist for the demo
-- admin but Mood and the questionnaire itself don't. This recreates the
-- whole thing from scratch as one tracked migration so a future reset can't
-- lose it again, and assigns + plots it for the demo client so
-- ClientDashboard's chart has something to show.
--
-- Demo admin_id: 63aeb602-0056-4217-b120-9b6dc0c7c649 (Amanda)
-- Demo client user_id: 3d5e1d85-d7c6-4573-b61e-91d19daa07bb (Cassie)

-- ── Mood tag (Sleep/Stress already exist for this admin). Requires
-- 20260826000018_scope_tags_unique_to_admin.sql first — tags.name used to be
-- unique table-wide instead of per admin, and a different real admin already
-- has their own "Mood" tag.
insert into public.tags (id, name, admin_id, is_demo)
values ('e1000000-0000-0000-0000-000000000001', 'Mood', '63aeb602-0056-4217-b120-9b6dc0c7c649', false)
on conflict (id) do nothing;

-- ── Weekly check-in questionnaire ─────────────────────────────────────────────
insert into public.questionnaires
  (id, admin_id, title, description, form_type, frequency, is_active, is_demo)
values (
  'd2000000-0000-0000-0000-000000000001',
  '63aeb602-0056-4217-b120-9b6dc0c7c649',
  'Weekly Wellbeing Check-in',
  'A short weekly check-in tracking mood, sleep, and stress, plus space for open reflection.',
  'outcome_measure',
  'weekly',
  true,
  true
)
on conflict (id) do nothing;

-- ── Questions — three general scale questions (one per tag) + two open text ──
insert into public.questions
  (id, questionnaire_id, text, type, min_value, max_value, min_label, max_label, order_index, is_required, tag_id)
values
  (
    'd2000000-0000-0000-0000-000000000011',
    'd2000000-0000-0000-0000-000000000001',
    'Overall, how would you rate your mood this week?',
    'scale', 1, 10, 'Very low', 'Very good', 0, true,
    'e1000000-0000-0000-0000-000000000001'
  ),
  (
    'd2000000-0000-0000-0000-000000000012',
    'd2000000-0000-0000-0000-000000000001',
    'How would you rate your sleep this week?',
    'scale', 1, 10, 'Very poor', 'Very good', 1, true,
    'e1000000-0000-0000-0000-000000000002'
  ),
  (
    'd2000000-0000-0000-0000-000000000013',
    'd2000000-0000-0000-0000-000000000001',
    'How manageable did your stress feel this week?',
    'scale', 1, 10, 'Overwhelming', 'Very manageable', 2, true,
    'e1000000-0000-0000-0000-000000000003'
  ),
  (
    'd2000000-0000-0000-0000-000000000014',
    'd2000000-0000-0000-0000-000000000001',
    'What stood out for you this week?',
    'text', null, null, null, null, 3, false, null
  ),
  (
    'd2000000-0000-0000-0000-000000000015',
    'd2000000-0000-0000-0000-000000000001',
    'What''s one thing you want to focus on next week?',
    'text', null, null, null, null, 4, false, null
  )
on conflict (id) do nothing;

-- ── Assign to the demo client and mark it as the plotted chart ───────────────
-- qa_one_plotted_per_user is a partial unique index (user_id) where
-- is_plotted — only one assignment per user can be plotted at a time. The
-- demo client already had "Daily Check-In" plotted (0 responses, so nothing
-- is lost by un-plotting it) — clear that first so this insert doesn't
-- collide with it.
update public.questionnaire_assignments
set is_plotted = false
where user_id = '3d5e1d85-d7c6-4573-b61e-91d19daa07bb'
  and is_plotted = true;

-- No unique constraint on (questionnaire_id, user_id) to key an ON CONFLICT
-- off, so guard idempotency with a plain existence check instead.
insert into public.questionnaire_assignments (questionnaire_id, user_id, is_plotted)
select 'd2000000-0000-0000-0000-000000000001', '3d5e1d85-d7c6-4573-b61e-91d19daa07bb', true
where not exists (
  select 1 from public.questionnaire_assignments
  where questionnaire_id = 'd2000000-0000-0000-0000-000000000001'
    and user_id = '3d5e1d85-d7c6-4573-b61e-91d19daa07bb'
);

-- ── Historic weekly responses — a gentle, believable improvement arc ─────────
insert into public.responses (id, user_id, questionnaire_id, scores, submitted_at) values

(gen_random_uuid(), '3d5e1d85-d7c6-4573-b61e-91d19daa07bb', 'd2000000-0000-0000-0000-000000000001',
 '{
   "d2000000-0000-0000-0000-000000000011": 4,
   "d2000000-0000-0000-0000-000000000012": 4,
   "d2000000-0000-0000-0000-000000000013": 3,
   "d2000000-0000-0000-0000-000000000014": "Work has been overwhelming and I have not been sleeping well because of it.",
   "d2000000-0000-0000-0000-000000000015": "Try to switch off from emails in the evening."
 }'::jsonb, '2026-06-15 18:30:00+00'),

(gen_random_uuid(), '3d5e1d85-d7c6-4573-b61e-91d19daa07bb', 'd2000000-0000-0000-0000-000000000001',
 '{
   "d2000000-0000-0000-0000-000000000011": 5,
   "d2000000-0000-0000-0000-000000000012": 5,
   "d2000000-0000-0000-0000-000000000013": 4,
   "d2000000-0000-0000-0000-000000000014": "Managed to switch off one evening this week, which helped a bit.",
   "d2000000-0000-0000-0000-000000000015": "Keep that up and try it for two evenings next week."
 }'::jsonb, '2026-06-22 18:30:00+00'),

(gen_random_uuid(), '3d5e1d85-d7c6-4573-b61e-91d19daa07bb', 'd2000000-0000-0000-0000-000000000001',
 '{
   "d2000000-0000-0000-0000-000000000011": 5,
   "d2000000-0000-0000-0000-000000000012": 6,
   "d2000000-0000-0000-0000-000000000013": 5,
   "d2000000-0000-0000-0000-000000000014": "Slept better most nights this week. Still feeling stretched thin at work though.",
   "d2000000-0000-0000-0000-000000000015": "Have the conversation with my manager about workload."
 }'::jsonb, '2026-06-29 18:30:00+00'),

(gen_random_uuid(), '3d5e1d85-d7c6-4573-b61e-91d19daa07bb', 'd2000000-0000-0000-0000-000000000001',
 '{
   "d2000000-0000-0000-0000-000000000011": 7,
   "d2000000-0000-0000-0000-000000000012": 7,
   "d2000000-0000-0000-0000-000000000013": 7,
   "d2000000-0000-0000-0000-000000000014": "Had the conversation with my manager and it went better than expected — she was receptive about the workload.",
   "d2000000-0000-0000-0000-000000000015": "Keep the check-in habit going and carve out one evening just for myself."
 }'::jsonb, '2026-07-06 18:30:00+00'),

(gen_random_uuid(), '3d5e1d85-d7c6-4573-b61e-91d19daa07bb', 'd2000000-0000-0000-0000-000000000001',
 '{
   "d2000000-0000-0000-0000-000000000011": 6,
   "d2000000-0000-0000-0000-000000000012": 6,
   "d2000000-0000-0000-0000-000000000013": 5,
   "d2000000-0000-0000-0000-000000000014": "Performance reviews are coming up and the old anxiety crept back a bit, though I noticed it quicker this time.",
   "d2000000-0000-0000-0000-000000000015": "Write down what I am actually proud of this year before the review."
 }'::jsonb, '2026-07-13 18:30:00+00'),

(gen_random_uuid(), '3d5e1d85-d7c6-4573-b61e-91d19daa07bb', 'd2000000-0000-0000-0000-000000000001',
 '{
   "d2000000-0000-0000-0000-000000000011": 8,
   "d2000000-0000-0000-0000-000000000012": 8,
   "d2000000-0000-0000-0000-000000000013": 7,
   "d2000000-0000-0000-0000-000000000014": "The review went really well — I went in prepared and felt calm, and got positive feedback I had not expected.",
   "d2000000-0000-0000-0000-000000000015": "Start thinking about what I want the next 6 months to look like."
 }'::jsonb, '2026-07-20 18:30:00+00'),

(gen_random_uuid(), '3d5e1d85-d7c6-4573-b61e-91d19daa07bb', 'd2000000-0000-0000-0000-000000000001',
 '{
   "d2000000-0000-0000-0000-000000000011": 7,
   "d2000000-0000-0000-0000-000000000012": 8,
   "d2000000-0000-0000-0000-000000000013": 7,
   "d2000000-0000-0000-0000-000000000014": "Quieter week. Sleep has been consistently good, which seems to be making everything else easier.",
   "d2000000-0000-0000-0000-000000000015": "Explore what a healthy work boundary actually looks like in practice."
 }'::jsonb, '2026-07-27 18:30:00+00'),

(gen_random_uuid(), '3d5e1d85-d7c6-4573-b61e-91d19daa07bb', 'd2000000-0000-0000-0000-000000000001',
 '{
   "d2000000-0000-0000-0000-000000000011": 8,
   "d2000000-0000-0000-0000-000000000012": 8,
   "d2000000-0000-0000-0000-000000000013": 8,
   "d2000000-0000-0000-0000-000000000014": "Said no to extra work this week and did not feel guilty about it afterwards — that is genuinely new for me.",
   "d2000000-0000-0000-0000-000000000015": "Think about whether I want to reduce session frequency, not because things are bad but because I feel ready."
 }'::jsonb, '2026-08-03 18:30:00+00'),

(gen_random_uuid(), '3d5e1d85-d7c6-4573-b61e-91d19daa07bb', 'd2000000-0000-0000-0000-000000000001',
 '{
   "d2000000-0000-0000-0000-000000000011": 7,
   "d2000000-0000-0000-0000-000000000012": 7,
   "d2000000-0000-0000-0000-000000000013": 7,
   "d2000000-0000-0000-0000-000000000014": "Steady week, nothing dramatic either way. That steadiness itself feels like the progress now.",
   "d2000000-0000-0000-0000-000000000015": "Keep noticing the small wins instead of only the big ones."
 }'::jsonb, '2026-08-10 18:30:00+00'),

(gen_random_uuid(), '3d5e1d85-d7c6-4573-b61e-91d19daa07bb', 'd2000000-0000-0000-0000-000000000001',
 '{
   "d2000000-0000-0000-0000-000000000011": 8,
   "d2000000-0000-0000-0000-000000000012": 9,
   "d2000000-0000-0000-0000-000000000013": 8,
   "d2000000-0000-0000-0000-000000000014": "Best sleep in months this week, and it showed in how I handled a stressful client call at work.",
   "d2000000-0000-0000-0000-000000000015": "Keep the wind-down routine before bed going even on busy nights."
 }'::jsonb, '2026-08-17 18:30:00+00'),

(gen_random_uuid(), '3d5e1d85-d7c6-4573-b61e-91d19daa07bb', 'd2000000-0000-0000-0000-000000000001',
 '{
   "d2000000-0000-0000-0000-000000000011": 8,
   "d2000000-0000-0000-0000-000000000012": 8,
   "d2000000-0000-0000-0000-000000000013": 8,
   "d2000000-0000-0000-0000-000000000014": "Feeling more settled in myself than I have in a long time. Looking forward to our next session.",
   "d2000000-0000-0000-0000-000000000015": "Keep this pace going into next month."
 }'::jsonb, '2026-08-24 18:30:00+00');
