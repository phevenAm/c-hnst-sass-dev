-- Seed the CORE-10 as a system-default outcome measure.
-- After inserting the system default, copy it to every existing admin so they
-- all start with it in their forms list (matching what the trigger does for
-- new admins going forward).

DO $func$
DECLARE
  v_q_id    uuid;
  v_admin   record;
  v_new_q   uuid;
  v_q       record;

  -- Standard (normal) scoring: Not at all=0 … Most or all of the time=4
  standard_opts constant jsonb := '[
    {"label":"Not at all",               "value":0},
    {"label":"Only occasionally",        "value":1},
    {"label":"Sometimes",                "value":2},
    {"label":"Often",                    "value":3},
    {"label":"Most or all of the time",  "value":4}
  ]';

  -- Reversed scoring (wellbeing items): Not at all=4 … Most or all of the time=0
  reversed_opts constant jsonb := '[
    {"label":"Not at all",               "value":4},
    {"label":"Only occasionally",        "value":3},
    {"label":"Sometimes",                "value":2},
    {"label":"Often",                    "value":1},
    {"label":"Most or all of the time",  "value":0}
  ]';
BEGIN

  -- ── Insert the system-default CORE-10 questionnaire ──────────────────────────
  INSERT INTO public.questionnaires (
    admin_id, title, description, frequency,
    is_active, form_type, is_system_default
  ) VALUES (
    NULL,
    'CORE-10',
    'Clinical Outcomes in Routine Evaluation — 10 items. Rates how often each statement applied over the last week. Higher total score indicates greater distress.',
    'weekly',
    true,
    'outcome_measure',
    true
  )
  RETURNING id INTO v_q_id;

  INSERT INTO public.questions
    (questionnaire_id, text, type, order_index, is_required, options)
  VALUES
    (v_q_id, 'I have felt tense, anxious or nervous',                              'multiple_choice', 1,  true, standard_opts),
    (v_q_id, 'I have felt I have someone to turn to for support when needed',       'multiple_choice', 2,  true, reversed_opts),
    (v_q_id, 'I have felt able to cope when things go wrong',                       'multiple_choice', 3,  true, reversed_opts),
    (v_q_id, 'Talking to people has felt too much for me',                          'multiple_choice', 4,  true, standard_opts),
    (v_q_id, 'I have felt panic or terror',                                         'multiple_choice', 5,  true, standard_opts),
    (v_q_id, 'I made plans to end my life',                                         'multiple_choice', 6,  true, standard_opts),
    (v_q_id, 'I have had difficulty getting to sleep or staying asleep',            'multiple_choice', 7,  true, standard_opts),
    (v_q_id, 'I have felt despairing or hopeless',                                  'multiple_choice', 8,  true, standard_opts),
    (v_q_id, 'I have felt unhappy',                                                 'multiple_choice', 9,  true, standard_opts),
    (v_q_id, 'Unwanted images or memories have been distressing me',                'multiple_choice', 10, true, standard_opts);

  -- ── Copy to every existing admin ──────────────────────────────────────────────
  FOR v_admin IN SELECT id FROM public.users WHERE role = 'admin'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.questionnaires
      WHERE admin_id = v_admin.id AND source_default_id = v_q_id
    ) THEN
      INSERT INTO public.questionnaires (
        admin_id, title, description, frequency, is_active,
        form_type, is_system_default, source_default_id
      )
      SELECT
        v_admin.id, title, description, frequency, is_active,
        form_type, false, v_q_id
      FROM public.questionnaires WHERE id = v_q_id
      RETURNING id INTO v_new_q;

      FOR v_q IN
        SELECT * FROM public.questions WHERE questionnaire_id = v_q_id ORDER BY order_index
      LOOP
        INSERT INTO public.questions (
          questionnaire_id, text, type, order_index, is_required,
          min_value, max_value, min_label, max_label, options, tag_id
        ) VALUES (
          v_new_q, v_q.text, v_q.type, v_q.order_index, v_q.is_required,
          v_q.min_value, v_q.max_value, v_q.min_label, v_q.max_label,
          v_q.options, v_q.tag_id
        );
      END LOOP;
    END IF;
  END LOOP;

END;
$func$;
