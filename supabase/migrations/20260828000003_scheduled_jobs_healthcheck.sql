-- Guard against the failure that hid for months: the send-session-reminders
-- edge function was deployed and correct, but nothing was scheduled to call it,
-- so client reminder emails silently never went out. Unit tests can't see that
-- gap. This does.
--
-- check_scheduled_jobs_health() verifies each cron job this app relies on still
-- exists, is active, and had a recent successful run. If not, it raises a
-- 'platform_alert' notification for every superadmin (deduped against an
-- existing unread one so it doesn't pile up daily). Runs daily at 11:00 UTC —
-- after the 08:00 client-reminder job and well within any job's cadence.

create or replace function public.check_scheduled_jobs_health()
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  -- Every job in cron.job that must keep running. Add new ones here.
  v_expected text[] := array[
    'send-client-session-reminders',   -- daily  0 8 * * *
    'auto-cancel-unpaid-sessions',     -- hourly 0 * * * *
    'send-admin-session-reminders'     -- 15-min */15 * * * *
  ];
  v_name        text;
  v_jobid       bigint;
  v_active      boolean;
  v_last_status text;
  v_last_end    timestamptz;
  v_problems    text[] := array[]::text[];
begin
  foreach v_name in array v_expected loop
    select jobid, active into v_jobid, v_active
    from cron.job
    where jobname = v_name;

    if v_jobid is null then
      v_problems := v_problems || format('%s: cron job is missing', v_name);
      continue;
    end if;

    if not v_active then
      v_problems := v_problems || format('%s: cron job is disabled', v_name);
      continue;
    end if;

    select status, end_time
    into v_last_status, v_last_end
    from cron.job_run_details
    where jobid = v_jobid
    order by start_time desc
    limit 1;

    -- Freshly created, no run history yet — not a problem.
    if v_last_end is null then
      continue;
    end if;

    if v_last_status is distinct from 'succeeded' then
      v_problems := v_problems
        || format('%s: last run %s at %s (%s)', v_name, v_last_status, v_last_end,
                  coalesce((select left(return_message, 120)
                            from cron.job_run_details
                            where jobid = v_jobid
                            order by start_time desc
                            limit 1), 'no message'));
    elsif v_last_end < now() - interval '26 hours' then
      v_problems := v_problems
        || format('%s: last successful run was %s (over 26h ago)', v_name, v_last_end);
    end if;
  end loop;

  if array_length(v_problems, 1) is null then
    return;
  end if;

  insert into public.notifications (user_id, type, message, url)
  select u.id,
         'platform_alert',
         'Scheduled job health check failed — ' || array_to_string(v_problems, '; '),
         '/superadmin'
  from public.users u
  where u.is_superadmin = true
    and not exists (
      select 1
      from public.notifications n
      where n.user_id = u.id
        and n.type = 'platform_alert'
        and n.read = false
        and n.message like 'Scheduled job health check failed%'
    );
end;
$func$;

select cron.schedule(
  'scheduled-jobs-healthcheck',
  '0 11 * * *',
  'select public.check_scheduled_jobs_health()'
);
