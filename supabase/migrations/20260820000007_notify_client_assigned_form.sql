-- Assigning a questionnaire/form to a client (questionnaire_assignments
-- insert) never notified the client at all, in-app or otherwise — the only
-- way they'd find out was navigating to Check-ins and happening to see it
-- listed. Stub clients (offline, no auth account) get no notification —
-- user_id is null for them, there's no notifications row to attach to.
create or replace function public.notify_client_assigned_form()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_title text;
begin
  if new.user_id is null then
    return new;
  end if;

  select title into v_title
  from public.questionnaires
  where id = new.questionnaire_id;

  insert into public.notifications (user_id, type, message, url)
  values (
    new.user_id,
    'form_assigned',
    'You''ve been assigned: ' || coalesce(v_title, 'a new check-in'),
    '/check-in'
  );

  return new;
end;
$func$;

drop trigger if exists qa_notify_client_assigned on public.questionnaire_assignments;
create trigger qa_notify_client_assigned
  after insert on public.questionnaire_assignments
  for each row execute function public.notify_client_assigned_form();
