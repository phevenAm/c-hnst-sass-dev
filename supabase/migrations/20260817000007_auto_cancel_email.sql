-- ─────────────────────────────────────────────────────────────────────────────
-- Auto-cancel sends a "cancelled due to non-payment" email (todo 462d37be).
--
-- The notify-auto-cancelled edge function is called via pg_net for each real
-- session cancelled by the cron. Stub sessions are not emailed (no real user).
--
-- Setup required in Supabase dashboard → Settings → Edge Functions → Secrets:
--   INTERNAL_AUTO_CANCEL_SECRET = ac-nl-cancel-e71a3b8c
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.auto_cancel_unpaid_sessions()
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_session_id uuid;
begin
  -- ── Real sessions: cancel and email each affected client ──────────────────
  for v_session_id in
    update public.sessions s
    set status = 'cancelled'
    from public.practice_settings ps
    where ps.admin_id       = s.created_by
      and ps.auto_cancel_enabled = true
      and s.status          = 'scheduled'
      and s.paid            = false
      and s.scheduled_at   <= now() + (ps.payment_deadline_hours * interval '1 hour')
    returning s.id
  loop
    perform net.http_post(
      url     := 'https://mxyfdvfbdrusbjiozuzx.supabase.co/functions/v1/notify-auto-cancelled',
      body    := jsonb_build_object('session_id', v_session_id)::text,
      headers := jsonb_build_object(
        'Content-Type',      'application/json',
        'x-internal-secret', 'ac-nl-cancel-e71a3b8c'
      )
    );
  end loop;

  -- ── Stub sessions: cancel only (offline clients have no email address) ────
  update public.stub_sessions ss
  set status = 'cancelled'
  from public.practice_settings ps
  where ps.admin_id           = ss.admin_id
    and ps.auto_cancel_enabled = true
    and ss.status             = 'scheduled'
    and ss.amount_paid        is null
    and ss.scheduled_at      <= now() + (ps.payment_deadline_hours * interval '1 hour');
end;
$func$;
