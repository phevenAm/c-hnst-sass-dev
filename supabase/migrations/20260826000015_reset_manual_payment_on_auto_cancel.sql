-- auto_cancel_unpaid_sessions() only ever set status = 'cancelled' — it never
-- touched manual_payment_status. So a session that had a manual bank-transfer
-- claim declined by the admin (manual_payment_status = 'declined') kept that
-- value forever, even after being auto-cancelled for non-payment. PaymentModal
-- reads manual_payment_status to decide which note to show, so if a client
-- ever ended up looking at that (now-)cancelled session again, they'd see the
-- stale "Your therapist couldn't verify this transfer" decline note as if it
-- were current — reported alongside a separate frontend bug where a cancelled
-- session could still be shown as the featured "next session" with a working
-- Pay button. Resetting to 'none' here means a cancelled session always shows
-- as having no outstanding manual payment claim, regardless of what happened
-- before it was cancelled.
create or replace function public.auto_cancel_unpaid_sessions()
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_session_id uuid;
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'internal_auto_cancel_secret');
begin
  -- Real sessions: cancel and email each affected client
  for v_session_id in
    update public.sessions s
    set status = 'cancelled',
        manual_payment_status = 'none'
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
      body    := jsonb_build_object('session_id', v_session_id),
      headers := jsonb_build_object(
        'Content-Type',      'application/json',
        'x-internal-secret', v_secret
      )
    );
  end loop;

  -- Stub sessions: cancel only (offline clients have no email address, and
  -- stub sessions have no manual_payment_status column to reset)
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
