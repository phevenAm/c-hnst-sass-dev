-- Crash reports submitted from the ErrorBoundary fallback are more urgent
-- than ordinary feedback — flag them so the superadmin inbox can surface
-- them with an alert badge.

alter table public.feedback
  add column if not exists severity text not null default 'normal';

do $blk$
begin
  if not exists (select 1 from pg_constraint where conname = 'feedback_severity_check') then
    alter table public.feedback
      add constraint feedback_severity_check check (severity in ('normal', 'high'));
  end if;
end
$blk$;

comment on column public.feedback.severity is
  'normal | high. high = shown with an alert badge in the superadmin inbox; set by the ErrorBoundary crash reporter.';
