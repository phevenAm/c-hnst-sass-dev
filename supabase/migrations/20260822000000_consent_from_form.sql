-- Lets an admin drive the client consent gate from one of their own
-- "onboarding"-type Forms instead of only the free-text fields typed
-- directly into Settings — so the same PDF-link + title an admin already
-- builds as a Form can double as the consent document, and they can keep
-- multiple onboarding forms around (only one linked as the active consent
-- gate at a time) rather than consent living as one bespoke settings blob.
--
-- Fully backward compatible: consent_questionnaire_id defaults to null, in
-- which case get_my_admin_consent_settings falls back to the existing
-- consent_title/consent_body/consent_pdf_url fields exactly as before —
-- nothing changes for a practice that hasn't picked a form yet.
alter table public.questionnaires
  add column if not exists pdf_url text;

alter table public.practice_settings
  add column if not exists consent_questionnaire_id uuid references public.questionnaires(id) on delete set null;

create or replace function public.get_my_admin_consent_settings()
returns table (
  consent_enabled        boolean,
  consent_title          text,
  consent_body           text,
  consent_pdf_url        text,
  consent_counsellor_cta text
)
language sql
security definer
stable
set search_path = public
as $func$
  select
    ps.consent_enabled,
    coalesce(q.title, ps.consent_title)      as consent_title,
    coalesce(q.description, ps.consent_body) as consent_body,
    coalesce(q.pdf_url, ps.consent_pdf_url)  as consent_pdf_url,
    ps.consent_counsellor_cta
  from public.practice_settings ps
  join public.users u on u.admin_id = ps.admin_id
  left join public.questionnaires q on q.id = ps.consent_questionnaire_id
  where u.id = auth.uid()
  limit 1;
$func$;
