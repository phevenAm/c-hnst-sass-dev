-- block_demo_write only ever got attached to the tables the demo flow was
-- originally built against (sessions, resources, questionnaires, etc.) —
-- payments, CPD logs, supervision, offline client stubs, availability, and
-- several other tables an admin uses day-to-day were never covered, so a
-- demo visitor could actually write real rows into the public demo account
-- through them (confirmed: Add payment on /admin/payments had no server-side
-- block at all). Widen it to the same table set block_paused_write already
-- covers (20260826000000_practice_pause.sql) — every table content actually
-- lives in, minus the ones already protected.
do $do$
declare
  t text;
begin
  foreach t in array array[
    'payments', 'cpd_logs', 'supervision_sessions', 'client_stubs', 'stub_sessions',
    'availability_rules', 'availability_overrides', 'admin_todos', 'admin_private_events',
    'session_packages', 'cancellation_requests', 'reschedule_requests', 'admin_reminder_mutes',
    'rcads_assessments', 'journal_entries', 'resource_favourites', 'client_views',
    'admin_google_calendar'
  ]
  loop
    execute format('drop trigger if exists block_demo_write on public.%I', t);
    execute format(
      'create trigger block_demo_write before insert or update or delete on public.%I for each row execute function public.block_demo_write()',
      t
    );
  end loop;
end
$do$;
