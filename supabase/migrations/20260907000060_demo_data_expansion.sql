-- ─────────────────────────────────────────────────────────────────────────────
-- Demo account — fuller data for marketing screenshots.
--
-- The demo practice (demo-admin@honest.com) had 4 clients, 1 with check-ins,
-- 4 payments, 4 resources, 1 form — every screen looked empty. This fills it
-- out: weekly wellbeing check-ins for every client over ~15 weeks (a real
-- trend line on the dashboard), more resources / payments / CPD / offline
-- clients / session notes / activity-log rows, and a second + third form.
--
-- All idempotent — re-running wipes each seeded set first (responses carry a
-- "_seed" key in their scores jsonb; everything else uses fixed id prefixes).
-- Demo-only: touches nothing outside the demo practice.
-- ─────────────────────────────────────────────────────────────────────────────

do $mig$
declare
  da     uuid := '63aeb602-0056-4217-b120-9b6dc0c7c649';   -- demo admin
  qid    uuid := 'd2000000-0000-0000-0000-000000000001';   -- Weekly Wellbeing Check-in
  qm     text := 'd2000000-0000-0000-0000-000000000011';   -- mood 1-10
  qs     text := 'd2000000-0000-0000-0000-000000000012';   -- sleep 1-10
  qx     text := 'd2000000-0000-0000-0000-000000000013';   -- stress 1-10
  q14    text := 'd2000000-0000-0000-0000-000000000014';   -- free text
  q15    text := 'd2000000-0000-0000-0000-000000000015';   -- focus text
  cassie uuid := '3d5e1d85-d7c6-4573-b61e-91d19daa07bb';
  jordan uuid := 'af145917-30e4-45a8-a0a5-fec879be9ff8';
  leila  uuid := '6da5b349-055b-4ccd-896e-3ed5a985cb78';
  marcus uuid := 'cb70617f-6584-4bc8-9f26-64b0c6a1ee66';
  priya  uuid := '1f534f0f-cc40-4dfe-bf36-6c563a8dec4a';
  monday timestamptz := date_trunc('week', now()) + interval '4 days 18 hours 30 minutes';
begin
  -- ── 0. Demo practice runs on the unlimited tier (no client cap in shots) ──
  update public.practice_settings
    set subscription_plan = 'unlimited', subscription_status = 'active'
    where admin_id = da;

  -- ── 1. Cassie belongs to the demo practice (the demo-client login) ─────────
  update public.users set admin_id = da, is_demo = true where id = cassie;

  -- ── 2. Plottable check-in assignment for every demo client ────────────────
  insert into public.questionnaire_assignments (questionnaire_id, user_id, assigned_at, is_plotted)
  select qid, u, now() - interval '16 weeks', true
  from unnest(array[cassie, jordan, leila, marcus, priya]) u
  where not exists (
    select 1 from public.questionnaire_assignments where questionnaire_id = qid and user_id = u
  );

  -- ── 3. 15 weeks of weekly check-ins per client, gently improving ──────────
  delete from public.responses where questionnaire_id = qid and scores ? '_seed';

  insert into public.responses (user_id, questionnaire_id, scores, submitted_at)
  select
    c.uid,
    qid,
    jsonb_build_object(
      '_seed', 'demo',
      qm, least(10, greatest(2, c.base + (w.n / 2) + (w.n % 3) - 1)),
      qs, least(10, greatest(2, c.base - 1 + (w.n / 3) + (w.n % 2))),
      qx, least(10, greatest(1, c.base - 2 + (w.n / 2) + ((w.n + 1) % 3))),
      q14, (array[
        'Steadier week — nothing dramatic either way.',
        'A couple of hard days mid-week, but I used the grounding exercise and it passed.',
        'Best I have felt in a while. Sleep is finally landing.',
        'Noticed the small wins this week instead of only the setbacks.',
        'Said no to extra work and did not feel guilty afterwards.'
      ])[1 + (w.n % 5)],
      q15, (array[
        'Keep the wind-down routine going even on busy nights.',
        'Bring the work boundary conversation to next session.',
        'Notice when I am catastrophising and name it.',
        'Keep the pace — maybe reduce session frequency soon.',
        'Practise the breathing before the Monday meeting.'
      ])[1 + (w.n % 5)]
    ),
    monday - ((15 - w.n) || ' weeks')::interval
  from (values
    (cassie, 5), (jordan, 3), (leila, 4), (marcus, 6), (priya, 4)
  ) as c(uid, base)
  cross join generate_series(0, 14) as w(n);

  -- ── 4. More offline (shadow) clients ─────────────────────────────────────
  delete from public.client_stubs where created_by = da and id::text like 'd5000000-%';
  insert into public.client_stubs (id, created_by, first_name, last_name, codename, email, created_at) values
    ('d5000000-0000-0000-0000-000000000001', da, 'Ade',   'Bello',    'Cedar',  null, now() - interval '55 days'),
    ('d5000000-0000-0000-0000-000000000002', da, 'Nina',  'Frost',    'Rowan',  'nina.f@example.com', now() - interval '40 days'),
    ('d5000000-0000-0000-0000-000000000003', da, 'Tom',   'Reyes',    'Aspen',  null, now() - interval '28 days'),
    ('d5000000-0000-0000-0000-000000000004', da, 'Sofia', 'Marchetti','Hazel',  'sofia.m@example.com', now() - interval '12 days');

  -- ── 5. Resources (is_demo) ───────────────────────────────────────────────
  delete from public.resources where is_demo and id::text like 'd6000000-%';
  insert into public.resources (id, title, summary, content, type, content_format, is_published, category, is_demo, admin_id, is_pinned, created_at) values
    ('d6000000-0000-0000-0000-000000000001','Grounding: the 5-4-3-2-1 technique','A 60-second sensory exercise for moments of overwhelm.','Name five things you can see, four you can feel, three you can hear, two you can smell, one you can taste. Slow each step.','article','markdown', true,'Mindfulness', true, da, true,  now() - interval '50 days'),
    ('d6000000-0000-0000-0000-000000000002','Sleep hygiene: the basics','Small, repeatable changes that add up to better sleep.','Consistent wake time, no screens for the last 30 minutes, keep the room cool and dark, get daylight within an hour of waking.','article','markdown', true,'Stress', true, da, false, now() - interval '46 days'),
    ('d6000000-0000-0000-0000-000000000003','Box breathing (video)','A three-minute guided breathing exercise.','','video', null, true,'Mindfulness', true, da, false, now() - interval '41 days'),
    ('d6000000-0000-0000-0000-000000000004','Thought record worksheet','Catch a hot thought, test the evidence, land on a balanced alternative.','PDF worksheet — bring it to session or fill it in between.','document','markdown', true,'CBT', true, da, true,  now() - interval '38 days'),
    ('d6000000-0000-0000-0000-000000000005','Values: what matters to you','A short prompt sheet to clarify what you want counselling to move you toward.','','document', null, true,'Mental Health', true, da, false, now() - interval '31 days'),
    ('d6000000-0000-0000-0000-000000000006','Understanding the stress response','Why your body reacts before your mind catches up, and what helps.','','article','markdown', true,'Stress', true, da, false, now() - interval '24 days'),
    ('d6000000-0000-0000-0000-000000000007','Behavioural activation: a starter plan','When low mood shrinks your world, this rebuilds it one small activity at a time.','','article','markdown', true,'CBT', true, da, false, now() - interval '18 days'),
    ('d6000000-0000-0000-0000-000000000008','Self-compassion break','Three lines to say to yourself when you are having a hard time.','','article','markdown', true,'Mindfulness', true, da, false, now() - interval '9 days');

  -- ── 6. Payments ─────────────────────────────────────────────────────────
  delete from public.payments where admin_id = da and id::text like 'd7000000-%';
  insert into public.payments (id, admin_id, client_id, amount_pence, description, paid_at, created_at)
  select
    ('d7000000-0000-0000-0000-0000000000' || lpad(gs::text, 2, '0'))::uuid,
    da,
    (array[cassie, jordan, leila, marcus, priya])[1 + (gs % 5)],
    6000,
    'Session — ' || to_char(now() - (gs * 6 || ' days')::interval, 'FMDD Mon'),
    now() - (gs * 6 || ' days')::interval,
    now() - (gs * 6 || ' days')::interval
  from generate_series(1, 18) gs;

  -- ── 7. CPD ──────────────────────────────────────────────────────────────
  delete from public.cpd_logs where admin_id = da and id::text like 'd8000000-%';
  insert into public.cpd_logs (id, admin_id, date, activity_type, title, provider, duration_minutes, notes) values
    ('d8000000-0000-0000-0000-000000000001', da, current_date - 62, 'training',        'Working with complex trauma', 'BACP',                 180, 'Phased model; stabilisation before processing.'),
    ('d8000000-0000-0000-0000-000000000002', da, current_date - 48, 'reading',          'The Body Keeps the Score (ch. 1-6)', 'van der Kolk',  120, 'Notes on interoception and safety.'),
    ('d8000000-0000-0000-0000-000000000003', da, current_date - 35, 'peer_consultation','Monthly peer group', 'Local BACP network',            90,  'Case discussion — endings.'),
    ('d8000000-0000-0000-0000-000000000004', da, current_date - 21, 'conference',       'Attachment & the therapeutic relationship', 'UKCP', 300, 'Keynote + two workshops.'),
    ('d8000000-0000-0000-0000-000000000005', da, current_date - 10, 'training',         'Suicide-safer practice refresher', 'Zero Suicide Alliance', 150, 'Updated risk-assessment framework.'),
    ('d8000000-0000-0000-0000-000000000006', da, current_date - 3,  'reading',          'Article: brief interventions for anxiety', 'Journal of Counselling', 45, '');

  -- ── 8. A couple more demo forms ─────────────────────────────────────────
  insert into public.questionnaires (id, title, description, frequency, is_active, is_demo, admin_id, form_type)
  values
    ('d2000000-0000-0000-0000-0000000000a1','GAD-7 (anxiety)','A standard 7-item anxiety screen, scored automatically.','weekly', true, true, da, 'outcome_measure'),
    ('d2000000-0000-0000-0000-0000000000b1','Session feedback','A quick check on how sessions are landing.','', true, true, da, 'feedback')
  on conflict (id) do nothing;

  delete from public.questions where questionnaire_id in ('d2000000-0000-0000-0000-0000000000a1','d2000000-0000-0000-0000-0000000000b1');
  insert into public.questions (id, questionnaire_id, text, type, min_label, min_value, max_label, max_value, order_index, is_required) values
    (gen_random_uuid(),'d2000000-0000-0000-0000-0000000000a1','Feeling nervous, anxious or on edge','scale','Not at all',0,'Nearly every day',3,1,true),
    (gen_random_uuid(),'d2000000-0000-0000-0000-0000000000a1','Not being able to stop or control worrying','scale','Not at all',0,'Nearly every day',3,2,true),
    (gen_random_uuid(),'d2000000-0000-0000-0000-0000000000a1','Worrying too much about different things','scale','Not at all',0,'Nearly every day',3,3,true),
    (gen_random_uuid(),'d2000000-0000-0000-0000-0000000000b1','How understood did you feel this session?','scale','Not at all',1,'Completely',10,1,true),
    (gen_random_uuid(),'d2000000-0000-0000-0000-0000000000b1','Anything you wish we had spent more time on?','text',null,null,null,null,2,false);

  -- ── 9. One account-summary note per client ──────────────────────────────
  delete from public.session_notes where admin_id = da and id::text like 'd9000000-%';
  insert into public.session_notes (id, admin_id, user_id, content, is_encrypted, created_at)
  select
    ('d9000000-0000-0000-0000-00000000000' || gs)::uuid,
    da,
    (array[cassie, jordan, leila, marcus, priya])[gs],
    'Working themes: sleep, work boundaries, low mood. Progress steady; reviewing frequency.',
    false,
    now() - (gs * 8 || ' days')::interval
  from generate_series(1, 5) gs
  where not exists (
    select 1 from public.session_notes sn
    where sn.user_id = (array[cassie, jordan, leila, marcus, priya])[gs] and sn.session_id is null
  );

  raise notice 'demo data expansion complete';
end $mig$;

-- ── 10. Extra activity-log rows (extends 20260907000030's 43) ──────────────
do $log$
declare
  da uuid := '63aeb602-0056-4217-b120-9b6dc0c7c649';
begin
  if not exists (select 1 from auth.users where id = da) then return; end if;

  delete from public.audit_logs
   where actor_id = da and coalesce(new_data->>'_seed', old_data->>'_seed') = 'demo-activity-2';

  insert into public.audit_logs (actor_id, created_at, action, table_name, record_id, old_data, new_data)
  select da, now() - (g.h || ' hours')::interval,
    (array['INSERT','UPDATE','INSERT','UPDATE','DELETE','INSERT','UPDATE','INSERT'])[1 + (g.h % 8)],
    (array['responses','sessions','payments','resources','session_notes','questionnaire_assignments','users','client_stubs'])[1 + (g.h % 8)],
    gen_random_uuid()::text,
    case when (g.h % 8) in (1,3,6) then jsonb_build_object('_seed','demo-activity-2','status','scheduled') else null end,
    case when (g.h % 8) = 4 then null
         else jsonb_build_object('_seed','demo-activity-2',
                'title', (array['Grounding: 5-4-3-2-1','Sleep hygiene: the basics','Box breathing','Thought record','Values sheet'])[1 + (g.h % 5)],
                'amount_pence', 6000,
                'status', (array['scheduled','completed','cancelled'])[1 + (g.h % 3)]) end
  from generate_series(2, 170, 3) as g(h);
end $log$;

notify pgrst, 'reload schema';
