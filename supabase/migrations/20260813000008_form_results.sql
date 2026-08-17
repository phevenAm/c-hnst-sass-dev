-- ── 1. Enforce one plotted assignment per offline client (mirrors the user_id index) ──

CREATE UNIQUE INDEX IF NOT EXISTS qa_one_plotted_per_stub
  ON public.questionnaire_assignments (stub_id)
  WHERE is_plotted = true AND stub_id IS NOT NULL;

-- ── 2. RPC: atomically toggle the plotted assignment for a client ──────────────────
-- Calling with an assignment that is NOT plotted → plots it (un-plots any other).
-- Calling with an assignment that IS plotted → un-plots it.
-- RLS applies (function runs as the calling user), so admins can only affect their own
-- clients' assignments.

CREATE OR REPLACE FUNCTION public.set_plotted_assignment(p_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $func$
DECLARE
  v_user_id      uuid;
  v_stub_id      uuid;
  v_is_plotted   boolean;
BEGIN
  SELECT user_id, stub_id, is_plotted
    INTO v_user_id, v_stub_id, v_is_plotted
  FROM questionnaire_assignments
  WHERE id = p_assignment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;

  -- Unset any currently plotted assignment for this client
  IF v_user_id IS NOT NULL THEN
    UPDATE questionnaire_assignments
      SET is_plotted = false
      WHERE user_id = v_user_id AND is_plotted = true;
  ELSIF v_stub_id IS NOT NULL THEN
    UPDATE questionnaire_assignments
      SET is_plotted = false
      WHERE stub_id = v_stub_id AND is_plotted = true;
  END IF;

  -- If it wasn't already plotted, set it now (toggling it on)
  IF NOT v_is_plotted THEN
    UPDATE questionnaire_assignments
      SET is_plotted = true
      WHERE id = p_assignment_id;
  END IF;
END;
$func$;
