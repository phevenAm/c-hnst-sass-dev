-- ─────────────────────────────────────────────────────────────────────────────
-- Manual payment workflow (todo ba1e94b1)
--
-- Clients can flag a session as manually paid (cash / bank transfer).
-- The admin then confirms or declines via the admin UI.
--
-- States:
--   'none'     — default, no manual payment requested
--   'pending'  — client has flagged this as paid manually; admin to verify
--   'approved' — admin confirmed the manual payment (sets paid = true)
--   'declined' — admin declined the manual payment claim
--
-- Two security-definer RPCs are the only way to update this column:
--   request_manual_payment(session_id)        — client only
--   respond_manual_payment(session_id, true/false) — admin only
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.sessions
  add column if not exists manual_payment_status text
    not null default 'none'
    check (manual_payment_status in ('none', 'pending', 'approved', 'declined'));

-- ── RPC: client requests manual payment verification ─────────────────────────
create or replace function public.request_manual_payment(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $func$
begin
  -- Only the session's own client can call this
  if not exists (
    select 1 from public.sessions
    where id = p_session_id
      and client_id = auth.uid()
      and status = 'scheduled'
      and paid = false
      and manual_payment_status = 'none'
  ) then
    raise exception 'Session not found, already paid, or manual payment already requested';
  end if;

  update public.sessions
  set manual_payment_status = 'pending'
  where id = p_session_id;
end;
$func$;

-- ── RPC: admin approves or declines the manual payment ───────────────────────
create or replace function public.respond_manual_payment(
  p_session_id uuid,
  p_approved   boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $func$
begin
  -- Admin must own this session (created_by = auth.uid())
  if not exists (
    select 1 from public.sessions
    where id = p_session_id
      and created_by = auth.uid()
      and manual_payment_status = 'pending'
  ) then
    raise exception 'Session not found or not pending manual payment approval';
  end if;

  if p_approved then
    update public.sessions
    set manual_payment_status = 'approved',
        paid                  = true,
        paid_at               = now()
    where id = p_session_id;
  else
    update public.sessions
    set manual_payment_status = 'declined'
    where id = p_session_id;
  end if;
end;
$func$;

-- ── Index: fast lookup of sessions pending manual verification ────────────────
create index if not exists sessions_manual_payment_pending_idx
  on public.sessions (created_by)
  where manual_payment_status = 'pending';
