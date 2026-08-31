-- Safeguarding: notify the counsellor when a client submits a check-in that
-- endorses a self-harm / crisis item.
--
-- Covers the two built-in measures that carry such an item:
--   PHQ-9   question 9 — "Thoughts that you would be better off dead …"
--   CORE-10 question 6 — "I made plans to end my life"
--
-- `responses.scores` is keyed by question id (uuid); order_index is copied
-- verbatim to every admin's copy of a system-default form, so matching on
-- (title, order_index) works for all copies. Any non-zero answer flags.
--
-- In-app only, mirroring notify_admin_client_consented /
-- notify_admin_manual_payment_pending (20260820000004): one realtime
-- notification per flagged submission, deep-linked to the client's page.

create or replace function public.notify_admin_risk_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_title      text;
  v_risk_order int;
  v_risk_qid   uuid;
  v_score      numeric;
  v_admin_id   uuid;
  v_first_name text;
begin
  if new.user_id is null or new.questionnaire_id is null then
    return new;
  end if;

  select title into v_title
  from public.questionnaires
  where id = new.questionnaire_id;

  v_risk_order := case v_title
                    when 'PHQ-9'   then 9
                    when 'CORE-10' then 6
                    else null
                  end;

  if v_risk_order is null then
    return new;
  end if;

  select id into v_risk_qid
  from public.questions
  where questionnaire_id = new.questionnaire_id
    and order_index = v_risk_order
  limit 1;

  if v_risk_qid is null then
    return new;
  end if;

  v_score := coalesce((new.scores ->> v_risk_qid::text)::numeric, 0);
  if v_score < 1 then
    return new;
  end if;

  select admin_id, first_name
    into v_admin_id, v_first_name
  from public.users
  where id = new.user_id;

  if v_admin_id is null then
    return new;
  end if;

  insert into public.notifications (user_id, type, message, url)
  values (
    v_admin_id,
    'risk_flag',
    coalesce(v_first_name, 'A client')
      || ' endorsed a risk item on their ' || v_title
      || ' check-in — review it and follow your safeguarding process',
    '/admin/clients/' || new.user_id
  );

  return new;
end;
$func$;

drop trigger if exists responses_notify_admin_risk on public.responses;
create trigger responses_notify_admin_risk
  after insert on public.responses
  for each row execute function public.notify_admin_risk_response();
