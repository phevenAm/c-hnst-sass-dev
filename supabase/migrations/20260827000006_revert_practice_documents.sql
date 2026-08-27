-- Revert the onboarding-documents feature (migrations 20260827000003/4).
-- Decision: the client-consent agreement is the ONE and only signature-gated
-- document, configured as plain text + PDF in Settings. Other PDFs are just
-- ordinary `resources` rows shown under Resources -> Documents.
--
-- Forward migration (never edit an applied file). Data-preserving: any
-- practice_documents rows are copied into `resources` first.

-- 1. Preserve any documents as resources before dropping the table.
insert into public.resources (admin_id, title, summary, type, category, url, is_published, is_sensitive)
select admin_id, title, description, 'document', 'Documents', pdf_url, true, false
from public.practice_documents
where admin_id is not null;

-- 2. Consent is plain-text-in-Settings only now — drop both the document link
--    and the older Form link.
alter table public.practice_settings drop column if exists consent_document_id;
alter table public.practice_settings drop column if exists consent_questionnaire_id;

-- 3. Drop the feature's tables.
drop table if exists public.document_signatures;
drop table if exists public.practice_documents cascade;

-- 4. Drop the feature's RPCs.
drop function if exists public.sign_document(uuid, text);
drop function if exists public.get_document_signature_summary();

-- 5. Restore get_my_admin_consent_settings() to its pre-feature 5-column shape,
--    reading only practice_settings (no questionnaire / document join).
drop function if exists public.get_my_admin_consent_settings();

create function public.get_my_admin_consent_settings()
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
    ps.consent_title,
    ps.consent_body,
    ps.consent_pdf_url,
    ps.consent_counsellor_cta
  from public.practice_settings ps
  join public.users u on u.admin_id = ps.admin_id
  where u.id = auth.uid()
  limit 1;
$func$;

revoke execute on function public.get_my_admin_consent_settings() from anon;

notify pgrst, 'reload schema';
