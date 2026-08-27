-- Move existing "onboarding" questionnaires into practice_documents and
-- repoint the client-consent gate at practice_documents instead of the
-- questionnaires table.
--
-- Safety: users.has_consented / consented_at / consent_signed_name are left
-- untouched and remain the gate signal, so a bad backfill here cannot
-- re-prompt an already-consented client — document_signatures is additive.

-- ── 1. practice_settings points at a document now ─────────────────────────────

alter table public.practice_settings
  add column if not exists consent_document_id uuid
    references public.practice_documents(id) on delete set null;

-- ── 2. Copy onboarding questionnaires → practice_documents ────────────────────
-- Temp mapping column carries old questionnaire id → new document id for the
-- consent-link and signature backfills below; dropped at the end.

alter table public.practice_documents
  add column if not exists source_questionnaire_id uuid;

insert into public.practice_documents (admin_id, title, description, pdf_url, source_questionnaire_id)
select
  q.admin_id,
  coalesce(nullif(q.title, ''), 'Onboarding document'),
  nullif(q.description, ''),
  nullif(q.pdf_url, ''),
  q.id
from public.questionnaires q
where q.form_type = 'onboarding'
  and q.admin_id is not null
  and not exists (
    select 1 from public.practice_documents d where d.source_questionnaire_id = q.id
  );

-- ── 3. Repoint the consent link via the mapping ──────────────────────────────

update public.practice_settings ps
set consent_document_id = d.id
from public.practice_documents d
where d.source_questionnaire_id = ps.consent_questionnaire_id
  and ps.consent_questionnaire_id is not null;

-- ── 4. Mark the linked document as the signature document ────────────────────

update public.practice_documents d
set requires_signature = true
from public.practice_settings ps
where ps.consent_document_id = d.id;

-- ── 5. Backfill signatures for already-consented clients ─────────────────────

insert into public.document_signatures (document_id, user_id, signed_name, signed_at)
select
  ps.consent_document_id,
  u.id,
  coalesce(
    nullif(u.consent_signed_name, ''),
    nullif(trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), ''),
    nullif(u.display_name, ''),
    'Client'
  ),
  coalesce(u.consented_at, now())
from public.users u
join public.users admin on admin.id = u.admin_id
join public.practice_settings ps on ps.admin_id = admin.id
where u.has_consented = true
  and u.role = 'client'
  and ps.consent_document_id is not null
on conflict (document_id, user_id) do nothing;

-- ── 6. Rewrite the consent-settings RPC to read practice_documents ───────────
-- Same return shape as 20260822000001, plus consent_document_id so the
-- consent modal can record a signature against the right document.
-- Drop first: CREATE OR REPLACE cannot change a RETURNS TABLE signature.

drop function if exists public.get_my_admin_consent_settings();

create or replace function public.get_my_admin_consent_settings()
returns table (
  consent_enabled        boolean,
  consent_title          text,
  consent_body           text,
  consent_pdf_url        text,
  consent_counsellor_cta text,
  consent_document_id    uuid
)
language sql
security definer
stable
set search_path = public
as $func$
  select
    ps.consent_enabled,
    coalesce(nullif(d.title, ''),       ps.consent_title)    as consent_title,
    coalesce(nullif(d.description, ''), ps.consent_body)     as consent_body,
    coalesce(nullif(d.pdf_url, ''),     ps.consent_pdf_url)  as consent_pdf_url,
    ps.consent_counsellor_cta,
    ps.consent_document_id
  from public.practice_settings ps
  join public.users u on u.admin_id = ps.admin_id
  left join public.practice_documents d on d.id = ps.consent_document_id
  where u.id = auth.uid()
  limit 1;
$func$;

-- ── 7. sign_document: record a client's signature + keep the gate signal ─────

create or replace function public.sign_document(p_document_id uuid, p_signed_name text)
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_name text := nullif(trim(p_signed_name), '');
begin
  if v_name is null then
    raise exception 'A signed name is required';
  end if;

  -- The document must belong to the caller's own practice.
  if not exists (
    select 1
    from public.practice_documents d
    join public.users u on u.id = auth.uid()
    where d.id = p_document_id
      and d.admin_id = u.admin_id
  ) then
    raise exception 'Document not found for this practice';
  end if;

  insert into public.document_signatures (document_id, user_id, signed_name, signed_at)
  values (p_document_id, auth.uid(), v_name, now())
  on conflict (document_id, user_id) do nothing;

  update public.users
  set has_consented       = true,
      consented_at        = coalesce(consented_at, now()),
      consent_signed_name = coalesce(nullif(consent_signed_name, ''), v_name)
  where id = auth.uid();
end;
$func$;

-- ── 8. get_document_signature_summary: admin tally for Settings ─────────────

create or replace function public.get_document_signature_summary()
returns table (
  document_id   uuid,
  document_title text,
  user_id       uuid,
  client_name   text,
  signed_name   text,
  signed_at     timestamptz
)
language sql
security definer
stable
set search_path = public
as $func$
  select
    d.id,
    d.title,
    c.id,
    coalesce(
      nullif(c.display_name, ''),
      nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), ''),
      'Client'
    ) as client_name,
    s.signed_name,
    s.signed_at
  from public.practice_documents d
  join public.users c
    on c.admin_id = d.admin_id
   and c.role = 'client'
   and c.deleted_at is null
  left join public.document_signatures s
    on s.document_id = d.id and s.user_id = c.id
  where d.admin_id = auth.uid()
    and d.requires_signature = true
  order by s.signed_at desc nulls last, 4;
$func$;

-- ── 9. Lock down RPC execute to match 20260826000012 ────────────────────────
-- get_my_admin_consent_settings was dropped above, losing its prior anon
-- revoke; re-apply it and add the two new auth.uid()-scoped functions.

revoke execute on function public.get_my_admin_consent_settings() from anon;
revoke execute on function public.sign_document(uuid, text) from anon;
revoke execute on function public.get_document_signature_summary() from anon;
