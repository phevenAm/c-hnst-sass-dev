-- ─────────────────────────────────────────────────────────────────────────────
-- Demo admin — seed a month of realistic Activity-log entries.
--
-- The demo account can't write real rows (block_demo_write fires on every
-- tenant table), so the audit_logs triggers never fire for a demo visitor and
-- /admin/audit-logs is empty. This seeds ~40 hand-crafted rows spread over the
-- last ~26 days so the "Activity" page looks lived-in.
--
-- Rows are tagged with  new_data/old_data ->> '_seed' = 'demo-activity'  so the
-- migration is idempotent — re-running wipes the previous seed first.
--
-- RLS on audit_logs is  actor_id = auth.uid()  (SELECT only); the demo login is
-- a real Supabase session for demo-admin@honest.com, so setting actor_id to
-- that user is all that's needed for the feed to show them.
-- ─────────────────────────────────────────────────────────────────────────────

do $mig$
declare
  v_admin uuid;
begin
  select id into v_admin from auth.users where email = 'demo-admin@honest.com';
  if v_admin is null then
    raise notice 'demo-admin@honest.com not found — skipping demo activity seed';
    return;
  end if;

  delete from public.audit_logs
   where actor_id = v_admin
     and coalesce(new_data ->> '_seed', old_data ->> '_seed') = 'demo-activity';

  insert into public.audit_logs (actor_id, created_at, action, table_name, record_id, old_data, new_data)
  select v_admin, t.created_at, t.action, t.table_name, gen_random_uuid()::text, t.old_data, t.new_data
  from (values
    -- ── ~4 weeks ago: onboarding Jordan ────────────────────────────────────
    (now() - interval '26 days 3 hours', 'INSERT', 'platform_access_token', null::jsonb,
      jsonb_build_object('_seed','demo-activity','is_used',false)),
    (now() - interval '26 days 2 hours', 'INSERT', 'users', null::jsonb,
      jsonb_build_object('_seed','demo-activity','first_name','Jordan','last_name','Ellis','role','client')),
    (now() - interval '25 days 20 hours', 'UPDATE', 'platform_access_token',
      jsonb_build_object('_seed','demo-activity','is_used',false),
      jsonb_build_object('_seed','demo-activity','is_used',true)),
    (now() - interval '25 days 4 hours', 'INSERT', 'sessions', null::jsonb,
      jsonb_build_object('_seed','demo-activity','status','scheduled','duration_minutes',50,'price_pence',6000,
        'scheduled_at',(now() - interval '18 days')::text)),
    (now() - interval '24 days 6 hours', 'INSERT', 'questionnaires', null::jsonb,
      jsonb_build_object('_seed','demo-activity','title','Weekly check-in')),
    (now() - interval '24 days 5 hours', 'INSERT', 'questionnaire_assignments', null::jsonb,
      jsonb_build_object('_seed','demo-activity')),
    (now() - interval '23 days 2 hours', 'INSERT', 'session_notes', null::jsonb,
      jsonb_build_object('_seed','demo-activity','is_encrypted',true)),
    (now() - interval '22 days 7 hours', 'UPDATE', 'sessions',
      jsonb_build_object('_seed','demo-activity','status','scheduled','paid',false,'price_pence',6000),
      jsonb_build_object('_seed','demo-activity','status','completed','paid',true,'price_pence',6000)),
    (now() - interval '21 days 3 hours', 'INSERT', 'payments', null::jsonb,
      jsonb_build_object('_seed','demo-activity','amount_pence',6000,'description','Session — 20 May')),

    -- ── 3 weeks ago: offline client + resources + tags ────────────────────
    (now() - interval '20 days 5 hours', 'INSERT', 'client_stubs', null::jsonb,
      jsonb_build_object('_seed','demo-activity','codename','Aspen','first_name','Sam','last_name','O''Neill')),
    (now() - interval '19 days 6 hours', 'INSERT', 'resources', null::jsonb,
      jsonb_build_object('_seed','demo-activity','title','Grounding techniques','category','anxiety')),
    (now() - interval '18 days 4 hours', 'INSERT', 'tags', null::jsonb,
      jsonb_build_object('_seed','demo-activity','name','Sleep')),
    (now() - interval '17 days 8 hours', 'UPDATE', 'users',
      jsonb_build_object('_seed','demo-activity','first_name','Priya','last_name','Raman','disabled',false),
      jsonb_build_object('_seed','demo-activity','first_name','Priya','last_name','Raman','disabled',true)),
    (now() - interval '16 days 2 hours', 'UPDATE', 'questionnaires',
      jsonb_build_object('_seed','demo-activity','title','Weekly check-in','is_published',false),
      jsonb_build_object('_seed','demo-activity','title','Weekly check-in','is_published',true)),
    (now() - interval '15 days 5 hours', 'INSERT', 'sessions', null::jsonb,
      jsonb_build_object('_seed','demo-activity','status','scheduled','duration_minutes',50,'price_pence',6000,
        'scheduled_at',(now() - interval '8 days')::text)),

    -- ── 2 weeks ago: reschedules, cancellations, reminders ────────────────
    (now() - interval '13 days 6 hours', 'UPDATE', 'sessions',
      jsonb_build_object('_seed','demo-activity','status','scheduled'),
      jsonb_build_object('_seed','demo-activity','status','cancelled')),
    (now() - interval '12 days 9 hours', 'UPDATE', 'sessions',
      jsonb_build_object('_seed','demo-activity','status','cancelled'),
      jsonb_build_object('_seed','demo-activity','status','scheduled')),
    (now() - interval '11 days 3 hours', 'DELETE', 'session_notes',
      jsonb_build_object('_seed','demo-activity','is_encrypted',true), null::jsonb),
    (now() - interval '10 days 6 hours', 'INSERT', 'admin_reminder_mutes', null::jsonb,
      jsonb_build_object('_seed','demo-activity')),
    (now() - interval '10 days 1 hour', 'DELETE', 'admin_reminder_mutes',
      jsonb_build_object('_seed','demo-activity'), null::jsonb),
    (now() - interval '9 days 5 hours', 'INSERT', 'stub_sessions', null::jsonb,
      jsonb_build_object('_seed','demo-activity','status','scheduled','duration_minutes',50)),
    (now() - interval '8 days 7 hours', 'UPDATE', 'payments',
      jsonb_build_object('_seed','demo-activity','amount_pence',5000),
      jsonb_build_object('_seed','demo-activity','amount_pence',6000)),
    (now() - interval '7 days 8 hours', 'DELETE', 'payments',
      jsonb_build_object('_seed','demo-activity','amount_pence',6000), null::jsonb),

    -- ── last week: Marcus onboarding + form churn ─────────────────────────
    (now() - interval '7 days 2 hours', 'INSERT', 'users', null::jsonb,
      jsonb_build_object('_seed','demo-activity','first_name','Marcus','last_name','Cole','role','client')),
    (now() - interval '6 days 6 hours', 'INSERT', 'questionnaire_assignments', null::jsonb,
      jsonb_build_object('_seed','demo-activity')),
    (now() - interval '6 days 2 hours', 'UPDATE', 'questionnaire_assignments',
      jsonb_build_object('_seed','demo-activity','status','pending'),
      jsonb_build_object('_seed','demo-activity','status','completed')),
    (now() - interval '5 days 7 hours', 'DELETE', 'questionnaire_assignments',
      jsonb_build_object('_seed','demo-activity'), null::jsonb),
    (now() - interval '5 days 3 hours', 'INSERT', 'session_notes', null::jsonb,
      jsonb_build_object('_seed','demo-activity','is_encrypted',true)),
    (now() - interval '4 days 6 hours', 'UPDATE', 'resources',
      jsonb_build_object('_seed','demo-activity','title','Grounding techniques','is_pinned',false),
      jsonb_build_object('_seed','demo-activity','title','Grounding techniques','is_pinned',true)),
    (now() - interval '4 days 2 hours', 'INSERT', 'resources', null::jsonb,
      jsonb_build_object('_seed','demo-activity','title','Sleep hygiene basics','category','sleep')),

    -- ── this week ────────────────────────────────────────────────────────
    (now() - interval '3 days 6 hours', 'INSERT', 'sessions', null::jsonb,
      jsonb_build_object('_seed','demo-activity','status','scheduled','duration_minutes',50,'price_pence',6000,
        'scheduled_at',(now() + interval '2 days')::text)),
    (now() - interval '3 days 2 hours', 'UPDATE', 'sessions',
      jsonb_build_object('_seed','demo-activity','status','scheduled','paid',false),
      jsonb_build_object('_seed','demo-activity','status','scheduled','paid',true)),
    (now() - interval '2 days 8 hours', 'INSERT', 'payments', null::jsonb,
      jsonb_build_object('_seed','demo-activity','amount_pence',4500,'description','Session — this week')),
    (now() - interval '2 days 4 hours', 'UPDATE', 'users',
      jsonb_build_object('_seed','demo-activity','first_name','Leila','last_name','Haddad','email','leila.h@example.com'),
      jsonb_build_object('_seed','demo-activity','first_name','Leila','last_name','Haddad','email','leila.haddad@example.com')),
    (now() - interval '2 days 1 hour', 'INSERT', 'tags', null::jsonb,
      jsonb_build_object('_seed','demo-activity','name','Low mood')),
    (now() - interval '1 day 9 hours', 'UPDATE', 'tags',
      jsonb_build_object('_seed','demo-activity','name','Stress'),
      jsonb_build_object('_seed','demo-activity','name','Stress & overwhelm')),
    (now() - interval '1 day 5 hours', 'DELETE', 'tags',
      jsonb_build_object('_seed','demo-activity','name','Unused tag'), null::jsonb),
    (now() - interval '1 day 2 hours', 'INSERT', 'client_stubs', null::jsonb,
      jsonb_build_object('_seed','demo-activity','codename','Cedar','first_name','Alex','last_name','Frost')),
    (now() - interval '20 hours', 'UPDATE', 'client_stubs',
      jsonb_build_object('_seed','demo-activity','codename','Cedar','first_name','Alex','last_name','Frost'),
      jsonb_build_object('_seed','demo-activity','codename','Cedar','first_name','Alex','last_name','Frost-Barnes')),
    (now() - interval '12 hours', 'DELETE', 'client_stubs',
      jsonb_build_object('_seed','demo-activity','codename','Birch','first_name','Old','last_name','Record'), null::jsonb),
    (now() - interval '6 hours', 'INSERT', 'sessions', null::jsonb,
      jsonb_build_object('_seed','demo-activity','status','scheduled','duration_minutes',50,'price_pence',6000,
        'scheduled_at',(now() + interval '5 days')::text)),
    (now() - interval '3 hours', 'UPDATE', 'sessions',
      jsonb_build_object('_seed','demo-activity','scheduled_at',(now() + interval '5 days')::text,'duration_minutes',50),
      jsonb_build_object('_seed','demo-activity','scheduled_at',(now() + interval '6 days')::text,'duration_minutes',60)),
    (now() - interval '1 hour', 'INSERT', 'session_notes', null::jsonb,
      jsonb_build_object('_seed','demo-activity','is_encrypted',true))
  ) as t(created_at, action, table_name, old_data, new_data);

  raise notice 'Seeded demo activity log for %', v_admin;
end $mig$;

notify pgrst, 'reload schema';
