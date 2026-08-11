-- Remove duplicate admin-owned CORE-10 questionnaires.
-- Keeps the one with the most responses (tie-break: oldest); deletes others
-- only when they have zero responses AND zero assignments — safe to run multiple times.
DO $func$
DECLARE
  v_admin_id uuid;
  v_keep_id  uuid;
BEGIN
  FOR v_admin_id IN
    SELECT admin_id
    FROM public.questionnaires
    WHERE admin_id IS NOT NULL AND title = 'CORE-10'
    GROUP BY admin_id
    HAVING COUNT(*) > 1
  LOOP
    SELECT q.id INTO v_keep_id
    FROM public.questionnaires q
    LEFT JOIN public.responses r ON r.questionnaire_id = q.id
    WHERE q.admin_id = v_admin_id AND q.title = 'CORE-10'
    GROUP BY q.id
    ORDER BY COUNT(r.id) DESC, q.created_at ASC
    LIMIT 1;

    DELETE FROM public.questionnaires
    WHERE admin_id = v_admin_id
      AND title = 'CORE-10'
      AND id <> v_keep_id
      AND NOT EXISTS (SELECT 1 FROM public.responses WHERE questionnaire_id = id)
      AND NOT EXISTS (SELECT 1 FROM public.questionnaire_assignments WHERE questionnaire_id = id);
  END LOOP;
END;
$func$;
