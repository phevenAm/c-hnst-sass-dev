-- Forms schema: adds form_type, system defaults, multiple-choice questions,
-- per-client plotted-form tracking, and a trigger to seed defaults to new admins.

-- ── 1. questionnaires ──────────────────────────────────────────────────────────

-- System defaults have no owner, so admin_id must be nullable.
ALTER TABLE public.questionnaires
  ALTER COLUMN admin_id DROP NOT NULL;

-- Frequency is only relevant for outcome measures; feedback/onboarding are one-off.
ALTER TABLE public.questionnaires
  ALTER COLUMN frequency DROP NOT NULL;

ALTER TABLE public.questionnaires
  ADD COLUMN IF NOT EXISTS form_type        text    NOT NULL DEFAULT 'outcome_measure'
    CHECK (form_type IN ('outcome_measure', 'feedback', 'onboarding')),
  ADD COLUMN IF NOT EXISTS is_system_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_default_id uuid
    REFERENCES public.questionnaires(id) ON DELETE SET NULL;

-- ── 2. questions ───────────────────────────────────────────────────────────────

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS options jsonb;  -- [{label, value}] for multiple_choice

-- Extend the type check to include multiple_choice.
ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_type_check;
ALTER TABLE public.questions
  ADD CONSTRAINT questions_type_check
    CHECK (type IN ('scale', 'text', 'multiple_choice'));

-- ── 3. questionnaire_assignments ───────────────────────────────────────────────

ALTER TABLE public.questionnaire_assignments
  ADD COLUMN IF NOT EXISTS is_plotted boolean NOT NULL DEFAULT false;

-- At most one plotted assignment per client.
CREATE UNIQUE INDEX IF NOT EXISTS qa_one_plotted_per_user
  ON public.questionnaire_assignments (user_id)
  WHERE is_plotted = true;

-- ── 4. RLS: admins can read system-default questionnaires ──────────────────────

-- Helper – bypasses RLS to check is_system_default safely.
CREATE OR REPLACE FUNCTION public.questionnaire_is_system_default(q_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS 'SELECT COALESCE(is_system_default, false) FROM public.questionnaires WHERE id = q_id';

-- Allow any authenticated admin to read system defaults.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS 'SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = ''admin'')';

DROP POLICY IF EXISTS "admins read system default questionnaires" ON public.questionnaires;
CREATE POLICY "admins read system default questionnaires"
  ON public.questionnaires FOR SELECT
  USING (is_system_default = true AND public.is_admin());

DROP POLICY IF EXISTS "admins read system default questions" ON public.questions;
CREATE POLICY "admins read system default questions"
  ON public.questions FOR SELECT
  USING (public.questionnaire_is_system_default(questionnaire_id) AND public.is_admin());

-- ── 5. Trigger: seed system-default forms when a new admin registers ───────────

CREATE OR REPLACE FUNCTION public.seed_admin_default_forms()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $func$
DECLARE
  v_default  record;
  v_new_q_id uuid;
  v_q        record;
BEGIN
  IF NEW.role = 'admin' THEN
    FOR v_default IN
      SELECT * FROM public.questionnaires WHERE is_system_default = true
    LOOP
      INSERT INTO public.questionnaires (
        admin_id, title, description, frequency, is_active,
        form_type, is_system_default, source_default_id
      ) VALUES (
        NEW.id,
        v_default.title,
        v_default.description,
        v_default.frequency,
        v_default.is_active,
        v_default.form_type,
        false,
        v_default.id
      )
      RETURNING id INTO v_new_q_id;

      FOR v_q IN
        SELECT * FROM public.questions
        WHERE questionnaire_id = v_default.id
        ORDER BY order_index
      LOOP
        INSERT INTO public.questions (
          questionnaire_id, text, type, order_index, is_required,
          min_value, max_value, min_label, max_label, options, tag_id
        ) VALUES (
          v_new_q_id, v_q.text, v_q.type, v_q.order_index, v_q.is_required,
          v_q.min_value, v_q.max_value, v_q.min_label, v_q.max_label,
          v_q.options, v_q.tag_id
        );
      END LOOP;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS on_new_admin_seed_forms ON public.users;
CREATE TRIGGER on_new_admin_seed_forms
  AFTER INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.seed_admin_default_forms();

-- ── 6. RPC: reset an admin's copy of a form back to the system default ─────────

CREATE OR REPLACE FUNCTION public.reset_form_to_default(p_questionnaire_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $func$
DECLARE
  v_default_id uuid;
  v_default    record;
  v_q          record;
BEGIN
  SELECT source_default_id INTO v_default_id
  FROM public.questionnaires
  WHERE id = p_questionnaire_id AND admin_id = auth.uid();

  IF v_default_id IS NULL THEN
    RAISE EXCEPTION 'Not found or no source default';
  END IF;

  SELECT * INTO v_default FROM public.questionnaires WHERE id = v_default_id;

  UPDATE public.questionnaires
  SET title       = v_default.title,
      description = v_default.description,
      frequency   = v_default.frequency
  WHERE id = p_questionnaire_id;

  DELETE FROM public.questions WHERE questionnaire_id = p_questionnaire_id;

  FOR v_q IN
    SELECT * FROM public.questions
    WHERE questionnaire_id = v_default_id
    ORDER BY order_index
  LOOP
    INSERT INTO public.questions (
      questionnaire_id, text, type, order_index, is_required,
      min_value, max_value, min_label, max_label, options, tag_id
    ) VALUES (
      p_questionnaire_id, v_q.text, v_q.type, v_q.order_index, v_q.is_required,
      v_q.min_value, v_q.max_value, v_q.min_label, v_q.max_label,
      v_q.options, v_q.tag_id
    );
  END LOOP;
END;
$func$;
