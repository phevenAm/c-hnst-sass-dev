-- Seeds six more standard outcome measures as system-default forms, the same
-- mechanism as CORE-10 (20260805000006_core10_seed.sql):
--
--   * one template row per measure with admin_id = NULL and
--     is_system_default = true,
--   * its items as `multiple_choice` questions carrying a scored `options`
--     JSONB ([{label,value}]); reverse-scored items just flip the values,
--   * copied to every future admin by seed_admin_default_forms() and to
--     every existing admin by the backfill loop at the end of this file.
--
-- All six are auto-summed by the generic engine — no bespoke scoring, no
-- rows outside `responses`, exactly like CORE-10. frequency is NULL (one-off;
-- the admin re-opens with "Prompt again"). None are plotted on the wellbeing
-- chart: they have no `scale` questions, so ProgressChart and the admin
-- "Chart" toggle already skip them, and 20260831000006 clears any historical
-- is_plotted flag pointing at a built-in measure.
--
-- Measures & licensing:
--   PHQ-9, GAD-7, PHQ-15 — PRIME-MD family (Spitzer/Williams/Kroenke, grant
--     from Pfizer); "no permission required to reproduce, translate, display
--     or distribute". Attribution kept in each description.
--   WSAS — Work & Social Adjustment Scale (Mundt et al., 2002); free to use.
--   PSS-10 — Perceived Stress Scale (Cohen et al., 1983); items 4,5,7,8
--     reverse-scored.
--   RCADS-25 — short-form Revised Children's Anxiety and Depression Scale
--     (© 1998 Bruce F. Chorpita & Susan H. Spence). Seeded as a plain summed
--     screen, NOT the is_rcads T-score flow: raw total 0-75, depression
--     items 1/4/8/10/13/15/16/18/19/21, the other 15 form the anxiety total.

do $mig$
declare
  -- PHQ-9 / GAD-7: "over the last 2 weeks, how often bothered by ..."
  phq_opts constant jsonb := '[
    {"label":"Not at all",               "value":0},
    {"label":"Several days",             "value":1},
    {"label":"More than half the days",  "value":2},
    {"label":"Nearly every day",         "value":3}
  ]';

  -- PHQ-15: "over the last 4 weeks, how much bothered by ..."
  phq15_opts constant jsonb := '[
    {"label":"Not bothered at all", "value":0},
    {"label":"Bothered a little",   "value":1},
    {"label":"Bothered a lot",      "value":2}
  ]';

  -- PSS-10 standard scoring
  pss_opts constant jsonb := '[
    {"label":"Never",        "value":0},
    {"label":"Almost never", "value":1},
    {"label":"Sometimes",    "value":2},
    {"label":"Fairly often", "value":3},
    {"label":"Very often",   "value":4}
  ]';

  -- PSS-10 reverse scoring (items 4, 5, 7, 8)
  pss_rev_opts constant jsonb := '[
    {"label":"Never",        "value":4},
    {"label":"Almost never", "value":3},
    {"label":"Sometimes",    "value":2},
    {"label":"Fairly often", "value":1},
    {"label":"Very often",   "value":0}
  ]';

  -- WSAS: 0 (not at all impaired) .. 8 (very severely impaired)
  wsas_opts constant jsonb := '[
    {"label":"0 - Not at all", "value":0},
    {"label":"1",              "value":1},
    {"label":"2 - Slightly",   "value":2},
    {"label":"3",              "value":3},
    {"label":"4 - Definitely", "value":4},
    {"label":"5",              "value":5},
    {"label":"6 - Markedly",   "value":6},
    {"label":"7",              "value":7},
    {"label":"8 - Very severe","value":8}
  ]';

  -- RCADS-25: Never / Sometimes / Often / Always (no reverse items)
  rcads_opts constant jsonb := '[
    {"label":"Never",     "value":0},
    {"label":"Sometimes", "value":1},
    {"label":"Often",     "value":2},
    {"label":"Always",    "value":3}
  ]';

  v_id    uuid;
  v_admin uuid;
  v_def   record;
  v_new   uuid;
  v_q     record;
begin
  -- ── PHQ-9 ──────────────────────────────────────────────────────────────────
  if not exists (select 1 from public.questionnaires where is_system_default and title = 'PHQ-9') then
    insert into public.questionnaires
      (admin_id, title, description, frequency, is_active, form_type, is_system_default)
    values
      (null, 'PHQ-9',
       'Patient Health Questionnaire-9 — depression severity. Developed by Drs Robert L. Spitzer, Janet B.W. Williams, Kurt Kroenke and colleagues; no permission required to reproduce. Rates how often each of nine symptoms has been a problem over the last 2 weeks. Total 0-27 (0-4 minimal, 5-9 mild, 10-14 moderate, 15-19 moderately severe, 20-27 severe). Item 9 asks about thoughts of self-harm.',
       null, true, 'outcome_measure', true)
    returning id into v_id;

    insert into public.questions (questionnaire_id, text, type, order_index, is_required, options) values
      (v_id, 'Little interest or pleasure in doing things',                                                        'multiple_choice', 1, true, phq_opts),
      (v_id, 'Feeling down, depressed, or hopeless',                                                               'multiple_choice', 2, true, phq_opts),
      (v_id, 'Trouble falling or staying asleep, or sleeping too much',                                            'multiple_choice', 3, true, phq_opts),
      (v_id, 'Feeling tired or having little energy',                                                              'multiple_choice', 4, true, phq_opts),
      (v_id, 'Poor appetite or overeating',                                                                        'multiple_choice', 5, true, phq_opts),
      (v_id, 'Feeling bad about yourself — or that you are a failure or have let yourself or your family down',     'multiple_choice', 6, true, phq_opts),
      (v_id, 'Trouble concentrating on things, such as reading the newspaper or watching television',              'multiple_choice', 7, true, phq_opts),
      (v_id, 'Moving or speaking so slowly that other people could have noticed — or the opposite, being so fidgety or restless that you have been moving around a lot more than usual', 'multiple_choice', 8, true, phq_opts),
      (v_id, 'Thoughts that you would be better off dead, or of hurting yourself in some way',                     'multiple_choice', 9, true, phq_opts);
  end if;

  -- ── GAD-7 ──────────────────────────────────────────────────────────────────
  if not exists (select 1 from public.questionnaires where is_system_default and title = 'GAD-7') then
    insert into public.questionnaires
      (admin_id, title, description, frequency, is_active, form_type, is_system_default)
    values
      (null, 'GAD-7',
       'Generalised Anxiety Disorder-7 — anxiety severity. Developed by Drs Robert L. Spitzer, Kurt Kroenke, Janet B.W. Williams and colleagues; no permission required to reproduce. Rates how often each of seven symptoms has been a problem over the last 2 weeks. Total 0-21 (0-4 minimal, 5-9 mild, 10-14 moderate, 15-21 severe); 10+ is the usual referral threshold.',
       null, true, 'outcome_measure', true)
    returning id into v_id;

    insert into public.questions (questionnaire_id, text, type, order_index, is_required, options) values
      (v_id, 'Feeling nervous, anxious, or on edge',                          'multiple_choice', 1, true, phq_opts),
      (v_id, 'Not being able to stop or control worrying',                    'multiple_choice', 2, true, phq_opts),
      (v_id, 'Worrying too much about different things',                      'multiple_choice', 3, true, phq_opts),
      (v_id, 'Trouble relaxing',                                             'multiple_choice', 4, true, phq_opts),
      (v_id, 'Being so restless that it is hard to sit still',                'multiple_choice', 5, true, phq_opts),
      (v_id, 'Becoming easily annoyed or irritable',                         'multiple_choice', 6, true, phq_opts),
      (v_id, 'Feeling afraid, as if something awful might happen',            'multiple_choice', 7, true, phq_opts);
  end if;

  -- ── WSAS ───────────────────────────────────────────────────────────────────
  if not exists (select 1 from public.questionnaires where is_system_default and title = 'WSAS') then
    insert into public.questionnaires
      (admin_id, title, description, frequency, is_active, form_type, is_system_default)
    values
      (null, 'WSAS',
       'Work and Social Adjustment Scale (Mundt et al., 2002) — how much the presenting problem impairs everyday functioning, rated 0 (not at all) to 8 (very severe) on five domains. Total 0-40: below 10 subclinical, 10-20 significant, above 20 moderately severe to severe.',
       null, true, 'outcome_measure', true)
    returning id into v_id;

    insert into public.questions (questionnaire_id, text, type, order_index, is_required, options) values
      (v_id, 'Because of my problem, my ability to work is impaired. (If you are retired or not working for reasons unrelated to your problem, answer "0 - Not at all".)',                                          'multiple_choice', 1, true, wsas_opts),
      (v_id, 'Because of my problem, my home management (cleaning, tidying, shopping, cooking, looking after home or children, paying bills) is impaired.',                                                          'multiple_choice', 2, true, wsas_opts),
      (v_id, 'Because of my problem, my social leisure activities with other people (parties, outings, visits, dating, entertaining) are impaired.',                                                                 'multiple_choice', 3, true, wsas_opts),
      (v_id, 'Because of my problem, my private leisure activities done alone (reading, gardening, hobbies, walking) are impaired.',                                                                                 'multiple_choice', 4, true, wsas_opts),
      (v_id, 'Because of my problem, my ability to form and maintain close relationships with others, including those I live with, is impaired.',                                                                    'multiple_choice', 5, true, wsas_opts);
  end if;

  -- ── PSS-10 ─────────────────────────────────────────────────────────────────
  if not exists (select 1 from public.questionnaires where is_system_default and title = 'PSS-10') then
    insert into public.questionnaires
      (admin_id, title, description, frequency, is_active, form_type, is_system_default)
    values
      (null, 'PSS-10',
       'Perceived Stress Scale (Cohen, Kamarck & Mermelstein, 1983) — how unpredictable, uncontrollable and overloaded respondents find their lives over the last month. Items 4, 5, 7 and 8 are reverse-scored. Total 0-40: 0-13 low, 14-26 moderate, 27-40 high perceived stress.',
       null, true, 'outcome_measure', true)
    returning id into v_id;

    insert into public.questions (questionnaire_id, text, type, order_index, is_required, options) values
      (v_id, 'In the last month, how often have you been upset because of something that happened unexpectedly?',              'multiple_choice',  1, true, pss_opts),
      (v_id, 'In the last month, how often have you felt that you were unable to control the important things in your life?',   'multiple_choice',  2, true, pss_opts),
      (v_id, 'In the last month, how often have you felt nervous and stressed?',                                              'multiple_choice',  3, true, pss_opts),
      (v_id, 'In the last month, how often have you felt confident about your ability to handle your personal problems?',      'multiple_choice',  4, true, pss_rev_opts),
      (v_id, 'In the last month, how often have you felt that things were going your way?',                                   'multiple_choice',  5, true, pss_rev_opts),
      (v_id, 'In the last month, how often have you found that you could not cope with all the things that you had to do?',    'multiple_choice',  6, true, pss_opts),
      (v_id, 'In the last month, how often have you been able to control irritations in your life?',                          'multiple_choice',  7, true, pss_rev_opts),
      (v_id, 'In the last month, how often have you felt that you were on top of things?',                                   'multiple_choice',  8, true, pss_rev_opts),
      (v_id, 'In the last month, how often have you been angered because of things that happened that were outside of your control?', 'multiple_choice', 9, true, pss_opts),
      (v_id, 'In the last month, how often have you felt difficulties were piling up so high that you could not overcome them?', 'multiple_choice', 10, true, pss_opts);
  end if;

  -- ── PHQ-15 ─────────────────────────────────────────────────────────────────
  if not exists (select 1 from public.questionnaires where is_system_default and title = 'PHQ-15') then
    insert into public.questionnaires
      (admin_id, title, description, frequency, is_active, form_type, is_system_default)
    values
      (null, 'PHQ-15',
       'Patient Health Questionnaire-15 — somatic symptom severity (Kroenke, Spitzer & Williams, 2002); no permission required to reproduce. How much each of 15 physical symptoms has bothered the respondent over the last 4 weeks. Total 0-30 (0-4 minimal, 5-9 low, 10-14 medium, 15-30 high somatic symptom burden).',
       null, true, 'outcome_measure', true)
    returning id into v_id;

    insert into public.questions (questionnaire_id, text, type, order_index, is_required, options) values
      (v_id, 'Stomach pain',                                                                          'multiple_choice',  1, true, phq15_opts),
      (v_id, 'Back pain',                                                                             'multiple_choice',  2, true, phq15_opts),
      (v_id, 'Pain in your arms, legs, or joints (knees, hips, etc.)',                                'multiple_choice',  3, true, phq15_opts),
      (v_id, 'Menstrual cramps or other problems with your periods (if this does not apply to you, answer "Not bothered at all")', 'multiple_choice', 4, true, phq15_opts),
      (v_id, 'Headaches',                                                                             'multiple_choice',  5, true, phq15_opts),
      (v_id, 'Chest pain',                                                                            'multiple_choice',  6, true, phq15_opts),
      (v_id, 'Dizziness',                                                                             'multiple_choice',  7, true, phq15_opts),
      (v_id, 'Fainting spells',                                                                       'multiple_choice',  8, true, phq15_opts),
      (v_id, 'Feeling your heart pound or race',                                                      'multiple_choice',  9, true, phq15_opts),
      (v_id, 'Shortness of breath',                                                                   'multiple_choice', 10, true, phq15_opts),
      (v_id, 'Pain or problems during sexual intercourse',                                            'multiple_choice', 11, true, phq15_opts),
      (v_id, 'Constipation, loose bowels, or diarrhoea',                                              'multiple_choice', 12, true, phq15_opts),
      (v_id, 'Nausea, gas, or indigestion',                                                           'multiple_choice', 13, true, phq15_opts),
      (v_id, 'Feeling tired or having low energy',                                                    'multiple_choice', 14, true, phq15_opts),
      (v_id, 'Trouble sleeping',                                                                      'multiple_choice', 15, true, phq15_opts);
  end if;

  -- ── RCADS-25 (short form, plain summed screen) ─────────────────────────────
  if not exists (select 1 from public.questionnaires where is_system_default and title = 'RCADS-25') then
    insert into public.questionnaires
      (admin_id, title, description, frequency, is_active, form_type, is_system_default)
    values
      (null, 'RCADS-25',
       'Revised Children''s Anxiety and Depression Scale — Short Version (25 items). © 1998 Bruce F. Chorpita & Susan H. Spence; see the User''s Guide at childfirst.ucla.edu. How often each statement is true for the young person. Scored Never 0 to Always 3; raw total 0-75. Depression items: 1, 4, 8, 10, 13, 15, 16, 18, 19, 21; the remaining 15 items form the anxiety total. For age- and gender-normed T-scores, use the full 47-item RCADS assessment instead.',
       null, true, 'outcome_measure', true)
    returning id into v_id;

    insert into public.questions (questionnaire_id, text, type, order_index, is_required, options) values
      (v_id, 'I feel sad or empty',                                                                                        'multiple_choice',  1, true, rcads_opts),
      (v_id, 'I worry when I think I have done poorly at something',                                                        'multiple_choice',  2, true, rcads_opts),
      (v_id, 'I would feel afraid of being on my own at home',                                                             'multiple_choice',  3, true, rcads_opts),
      (v_id, 'Nothing is much fun anymore',                                                                                'multiple_choice',  4, true, rcads_opts),
      (v_id, 'I worry that something awful will happen to someone in my family',                                           'multiple_choice',  5, true, rcads_opts),
      (v_id, 'I am afraid of being in crowded places (like shopping centres, the cinema, buses, busy playgrounds)',        'multiple_choice',  6, true, rcads_opts),
      (v_id, 'I worry what other people think of me',                                                                      'multiple_choice',  7, true, rcads_opts),
      (v_id, 'I have trouble sleeping',                                                                                    'multiple_choice',  8, true, rcads_opts),
      (v_id, 'I feel scared if I have to sleep on my own',                                                                 'multiple_choice',  9, true, rcads_opts),
      (v_id, 'I have problems with my appetite',                                                                           'multiple_choice', 10, true, rcads_opts),
      (v_id, 'I suddenly become dizzy or faint when there is no reason for this',                                          'multiple_choice', 11, true, rcads_opts),
      (v_id, 'I have to do some things over and over again (like washing my hands, cleaning, or putting things in a certain order)', 'multiple_choice', 12, true, rcads_opts),
      (v_id, 'I have no energy for things',                                                                                'multiple_choice', 13, true, rcads_opts),
      (v_id, 'I suddenly start to tremble or shake when there is no reason for this',                                      'multiple_choice', 14, true, rcads_opts),
      (v_id, 'I cannot think clearly',                                                                                     'multiple_choice', 15, true, rcads_opts),
      (v_id, 'I feel worthless',                                                                                           'multiple_choice', 16, true, rcads_opts),
      (v_id, 'I have to think of special thoughts (like numbers or words) to stop bad things from happening',              'multiple_choice', 17, true, rcads_opts),
      (v_id, 'I think about death',                                                                                        'multiple_choice', 18, true, rcads_opts),
      (v_id, 'I feel like I don''t want to move',                                                                          'multiple_choice', 19, true, rcads_opts),
      (v_id, 'I worry that I will suddenly get a scared feeling when there is nothing to be afraid of',                    'multiple_choice', 20, true, rcads_opts),
      (v_id, 'I am tired a lot',                                                                                           'multiple_choice', 21, true, rcads_opts),
      (v_id, 'I feel afraid that I will make a fool of myself in front of people',                                         'multiple_choice', 22, true, rcads_opts),
      (v_id, 'I have to do some things in just the right way to stop bad things from happening',                           'multiple_choice', 23, true, rcads_opts),
      (v_id, 'I feel restless',                                                                                            'multiple_choice', 24, true, rcads_opts),
      (v_id, 'I worry that something bad will happen to me',                                                               'multiple_choice', 25, true, rcads_opts);
  end if;

  -- ── Backfill: give every existing admin their own copy of any system-default
  --    form they don't yet have (matches seed_admin_default_forms() for new
  --    admins). Also self-heals any admin missing an older default. ───────────
  for v_admin in
    select u.id
    from public.users u
    where u.role = 'admin'
      -- admin_id FKs to auth.users; skip public.users rows with no auth row.
      and exists (select 1 from auth.users a where a.id = u.id)
  loop
    for v_def in
      select * from public.questionnaires where is_system_default = true
    loop
      if not exists (
        select 1 from public.questionnaires
        where admin_id = v_admin and source_default_id = v_def.id
      ) then
        insert into public.questionnaires (
          admin_id, title, description, frequency, is_active,
          form_type, is_system_default, source_default_id, is_rcads
        ) values (
          v_admin, v_def.title, v_def.description, v_def.frequency, v_def.is_active,
          v_def.form_type, false, v_def.id, v_def.is_rcads
        )
        returning id into v_new;

        for v_q in
          select * from public.questions
          where questionnaire_id = v_def.id
          order by order_index
        loop
          insert into public.questions (
            questionnaire_id, text, type, order_index, is_required,
            min_value, max_value, min_label, max_label, options, tag_id
          ) values (
            v_new, v_q.text, v_q.type, v_q.order_index, v_q.is_required,
            v_q.min_value, v_q.max_value, v_q.min_label, v_q.max_label,
            v_q.options, v_q.tag_id
          );
        end loop;
      end if;
    end loop;
  end loop;
end
$mig$;
