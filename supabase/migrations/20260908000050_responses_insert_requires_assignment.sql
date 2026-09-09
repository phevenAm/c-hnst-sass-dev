-- ─────────────────────────────────────────────────────────────────────────────
-- M2 — a client may only insert a response for a questionnaire actually
-- assigned to them.
--
-- "clients insert own responses" was `with check (user_id = auth.uid())` only —
-- a client could POST rows into public.responses for ANY questionnaire_id (a
-- questionnaire belonging to another practice, or a random / non-existent
-- UUID), polluting that practice's dashboards, charts and PDF exports for their
-- own user_id. Low severity (self-scoped, no cross-tenant read, no
-- escalation), but it's junk data a practitioner can't easily explain.
--
-- Fix: mirror the existing SELECT policy "clients view own assignments" /
-- "clients view assigned questionnaires" — require a questionnaire_assignments
-- row for (this user, this questionnaire). A client already cannot load a form
-- to fill without that assignment, so every legitimate submission (one-off or
-- recurring check-in) already satisfies this; only fabricated questionnaire_ids
-- are rejected.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "clients insert own responses" on public.responses;

create policy "clients insert own responses"
  on public.responses for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.questionnaire_assignments qa
      where qa.user_id = auth.uid()
        and qa.questionnaire_id = responses.questionnaire_id
    )
  );

notify pgrst, 'reload schema';
