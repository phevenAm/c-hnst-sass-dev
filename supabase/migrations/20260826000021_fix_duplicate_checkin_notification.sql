-- Assigning a questionnaire to a client produced TWO notifications for one
-- action: this trigger (fires synchronously on the questionnaire_assignments
-- insert, always, regardless of caller) plus a second insert from the
-- notify-questionnaire-assigned edge function (invoked explicitly alongside
-- the assignment from AdminQuestionnairesPage.tsx, whose real job is sending
-- the assignment email). The edge function's copy had no url, so it rendered
-- as an inert, non-clickable notification in NotificationBell.
--
-- Consolidating to this trigger as the single source of truth — it fires
-- reliably for every assignment however it's created, not just this one
-- admin button — and adopting the edge function's wording (the one Stephen
-- wants kept) since it reads better than the original. The edge function's
-- own notification insert is removed in the same change (see
-- supabase/functions/notify-questionnaire-assigned/index.ts); only its
-- email-sending responsibility remains there.
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
    'A new check-in has been assigned to you: ' || coalesce(v_title, 'a new check-in') || '.',
    '/check-in'
  );

  return new;
end;
$func$;
