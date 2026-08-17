-- Client consent / terms gate
--
-- Adds consent configuration to practice_settings (admin edits)
-- Adds has_consented tracking to users (client acknowledges)
-- Provides a narrow RPC so clients can read only the consent fields without
-- gaining access to sensitive columns (encryption keys etc.) in practice_settings.

-- 1. Consent config columns on practice_settings
alter table public.practice_settings
  add column if not exists consent_enabled          boolean not null default false,
  add column if not exists consent_title            text    not null default 'Before you continue',
  add column if not exists consent_body             text    not null default '',
  add column if not exists consent_pdf_url          text,
  add column if not exists consent_counsellor_cta   text    not null default 'If you have any questions, speak to your counsellor.';

-- 2. Consent tracking on users
alter table public.users
  add column if not exists has_consented  boolean     not null default false,
  add column if not exists consented_at   timestamptz;

-- 3. Backfill: clients who existed before this migration are marked as already
--    consented so they are not suddenly blocked when an admin enables the gate.
update public.users
set    has_consented = true,
       consented_at  = now()
where  role          = 'client'
  and  has_consented = false;

-- 4. Narrow RPC so a client can read their admin's consent settings without
--    needing SELECT access to the full practice_settings row.
--    security definer runs as the function owner (bypasses RLS deliberately)
--    but only returns the five consent columns.
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
    ps.consent_title,
    ps.consent_body,
    ps.consent_pdf_url,
    ps.consent_counsellor_cta
  from public.practice_settings ps
  join public.users u on u.admin_id = ps.admin_id
  where u.id = auth.uid()
  limit 1;
$func$;

grant execute on function public.get_my_admin_consent_settings() to authenticated;
