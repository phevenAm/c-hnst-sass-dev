-- Standardised built-in measures (CORE-10, RCADS, and the six added in
-- 20260831000005) are not plotted on the wellbeing chart — they use fixed
-- clinical scales, not the per-question 0-10 scale ProgressChart draws, and
-- have no `scale` questions so the chart would render an empty state anyway.
--
-- Clear any historical is_plotted flag that points at one of them so a client
-- who once had e.g. CORE-10 set as their charted form falls back to a custom
-- form (or the empty state) instead. Responses are untouched — only the chart
-- selection is reset. Custom admin-authored forms keep their flag.

update public.questionnaire_assignments qa
set is_plotted = false
where qa.is_plotted = true
  and exists (
    select 1
    from public.questionnaires q
    where q.id = qa.questionnaire_id
      and (
        q.is_rcads = true
        or q.is_system_default = true
        or q.source_default_id is not null   -- an admin's copy of a system default
      )
  );
