-- The demo client's "Weekly Wellbeing Check-in" (d2000000-…-0001) was seeded in
-- 20260826000019_recreate_demo_checkin.sql with form_type = 'outcome_measure'.
-- ClientDashboard's wellbeing chart was later tightened to only plot
-- form_type = 'check_in' forms (outcome measures are point-in-time clinical
-- scales, deliberately never charted), which silently dropped the demo
-- client's 11 weeks of chart data.
--
-- It is a light-touch, weekly, tagged Mood/Sleep/Stress form that exists purely
-- to give the demo dashboard something to plot — it always should have been a
-- check-in. Re-label it so it plots again.
update public.questionnaires
set form_type = 'check_in'
where id = 'd2000000-0000-0000-0000-000000000001'
  and form_type = 'outcome_measure';
