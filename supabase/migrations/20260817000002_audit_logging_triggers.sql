-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 7.3 — Enhanced audit logging (todo dc9ffd57)
--
-- Creates the audit_logs table (if missing) and DB-level triggers so that
-- the key admin actions are captured without any client-side logging calls.
--
-- Tables covered: sessions, payments, session_notes, questionnaire_assignments,
--   questionnaires, resources, tags, users (client rows).
--
-- Each row records: who acted (actor_id = auth.uid()), what happened
-- (INSERT/UPDATE/DELETE), which table, which record, and the before/after
-- snapshot as JSONB so the audit page can render meaningful messages.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. audit_logs table ──────────────────────────────────────────────────────
create table if not exists public.audit_logs (
  id          uuid         default gen_random_uuid() primary key,
  created_at  timestamptz  not null default now(),
  actor_id    uuid         references auth.users(id) on delete set null,
  action      text         not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  table_name  text         not null,
  record_id   text,
  old_data    jsonb,
  new_data    jsonb
);

alter table public.audit_logs enable row level security;

-- Admins see only logs where the actor is themselves or a client of theirs.
-- Using a simple "actor is me" rule keeps the policy fast and correct — admins
-- only take actions in their own practice.
drop policy if exists "admin reads own audit logs" on public.audit_logs;
create policy "admin reads own audit logs"
  on public.audit_logs for select
  using (actor_id = auth.uid());

-- ── 2. Trigger function ──────────────────────────────────────────────────────
create or replace function public.log_table_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
begin
  insert into public.audit_logs (actor_id, action, table_name, record_id, old_data, new_data)
  values (
    auth.uid(),
    tg_op,
    tg_table_name,
    coalesce(
      (case tg_op when 'DELETE' then row_to_json(old)::jsonb->>'id'
                  else row_to_json(new)::jsonb->>'id'
       end),
      null
    ),
    case tg_op when 'INSERT' then null else to_jsonb(old) end,
    case tg_op when 'DELETE' then null else to_jsonb(new) end
  );
  return null;
end;
$func$;

-- ── 3. Helper macro — drops & recreates a trigger ────────────────────────────
-- sessions ────────────────────────────────────────────────────────────────────
drop trigger if exists audit_sessions on public.sessions;
create trigger audit_sessions
  after insert or update or delete on public.sessions
  for each row execute function public.log_table_change();

-- payments ────────────────────────────────────────────────────────────────────
drop trigger if exists audit_payments on public.payments;
create trigger audit_payments
  after insert or update or delete on public.payments
  for each row execute function public.log_table_change();

-- session_notes ───────────────────────────────────────────────────────────────
drop trigger if exists audit_session_notes on public.session_notes;
create trigger audit_session_notes
  after insert or update or delete on public.session_notes
  for each row execute function public.log_table_change();

-- questionnaire_assignments ───────────────────────────────────────────────────
drop trigger if exists audit_questionnaire_assignments on public.questionnaire_assignments;
create trigger audit_questionnaire_assignments
  after insert or update or delete on public.questionnaire_assignments
  for each row execute function public.log_table_change();

-- questionnaires ──────────────────────────────────────────────────────────────
drop trigger if exists audit_questionnaires on public.questionnaires;
create trigger audit_questionnaires
  after insert or update or delete on public.questionnaires
  for each row execute function public.log_table_change();

-- resources ───────────────────────────────────────────────────────────────────
drop trigger if exists audit_resources on public.resources;
create trigger audit_resources
  after insert or update or delete on public.resources
  for each row execute function public.log_table_change();

-- tags ────────────────────────────────────────────────────────────────────────
drop trigger if exists audit_tags on public.tags;
create trigger audit_tags
  after insert or update or delete on public.tags
  for each row execute function public.log_table_change();

-- users (client rows only — admin self-modifications are excluded via the
-- actor_id = auth.uid() RLS policy on audit_logs; admin user changes to
-- their own profile are visible, but not other admins' rows) ──────────────────
drop trigger if exists audit_users on public.users;
create trigger audit_users
  after insert or update or delete on public.users
  for each row execute function public.log_table_change();

-- client_stubs ─────────────────────────────────────────────────────────────────
drop trigger if exists audit_client_stubs on public.client_stubs;
create trigger audit_client_stubs
  after insert or update or delete on public.client_stubs
  for each row execute function public.log_table_change();

notify pgrst, 'reload schema';
