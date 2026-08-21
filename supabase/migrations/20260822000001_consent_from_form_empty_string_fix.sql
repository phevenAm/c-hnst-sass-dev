-- A questionnaire's title/description/pdf_url default to '' (not null) when
-- an admin leaves them blank in the Forms builder — coalesce() only falls
-- through on null, so an onboarding form with a blank description was
-- silently blanking the consent body instead of falling back to
-- practice_settings.consent_body as intended. nullif() treats '' as null too.
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
    coalesce(nullif(q.title, ''), ps.consent_title)             as consent_title,
    coalesce(nullif(q.description, ''), ps.consent_body)        as consent_body,
    coalesce(nullif(q.pdf_url, ''), ps.consent_pdf_url)         as consent_pdf_url,
    ps.consent_counsellor_cta
  from public.practice_settings ps
  join public.users u on u.admin_id = ps.admin_id
  left join public.questionnaires q on q.id = ps.consent_questionnaire_id
  where u.id = auth.uid()
  limit 1;
$func$;
