-- ─────────────────────────────────────────────────────────────────────────────
-- "Mirror to Messages" for admin private calendar events.
--
-- When a practitioner blocks time on their own calendar (admin_private_events)
-- they can now let chosen clients know through the direct-messaging thread.
--
-- The private event itself stays invisible to clients — admin_private_events
-- has NO client-facing RLS policy, and nothing here adds one. Only two things
-- cross the boundary, both practitioner-controlled:
--   * the free-text summary the practitioner types in the compose box, and
--   * the start / end datetimes (already baked into that text by the UI).
-- The event's own `title` / `notes` never leave the practitioner's side.
--
-- Delivered as an ordinary message row (sender = admin, recipient = client)
-- flagged `kind = 'availability'` so the client thread can render it as a
-- notice rather than a chat bubble. notify-new-message fires per row exactly
-- as it does for a hand-typed message (in-app badge always; email only if the
-- client has been away past the cooldown).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Marker on messages ────────────────────────────────────────────────────
-- Additive + defaulted: every existing row reads as a normal 'chat' message.
alter table public.messages
  add column if not exists kind text not null default 'chat';

alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages
  add constraint messages_kind_check check (kind in ('chat', 'availability'));

-- Optional trace back to the originating event. `on delete set null` keeps the
-- message the client already saw if the practitioner later removes the block.
alter table public.messages
  add column if not exists private_event_id uuid
    references public.admin_private_events (id) on delete set null;

comment on column public.messages.kind is
  '''chat'' = ordinary message; ''availability'' = a mirrored private-event notice.';

-- ── 2. UI state on the event ─────────────────────────────────────────────────
alter table public.admin_private_events
  add column if not exists mirrored_at timestamptz;

comment on column public.admin_private_events.mirrored_at is
  'Last time this event was mirrored into client message threads, else null.';

-- ── 3. Fan-out RPC ───────────────────────────────────────────────────────────
-- SECURITY DEFINER: the owning admin has no INSERT path to a conversations row
-- for a pair that has no thread yet, and we want one atomic call for N clients.
-- Every branch is pinned to auth.uid() = the event's owner and to that admin's
-- own, still-active clients; unknown / other-practice client ids are skipped,
-- not errored, so one stale pick doesn't sink the whole send.
create or replace function public.mirror_private_event_to_clients(
  p_event_id   uuid,
  p_client_ids uuid[],
  p_body       text
)
returns table (message_id uuid, conversation_id uuid)
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_admin_id  uuid;
  v_client_id uuid;
  v_convo_id  uuid;
  v_msg_id    uuid;
  v_body      text := btrim(coalesce(p_body, ''));
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 4000 then
    raise exception 'message body must be 1..4000 characters';
  end if;

  select admin_id into v_admin_id
    from public.admin_private_events
   where id = p_event_id;
  if v_admin_id is null then
    raise exception 'private event % not found', p_event_id;
  end if;
  if v_admin_id <> auth.uid() then
    raise exception 'not your private event';
  end if;

  foreach v_client_id in array coalesce(p_client_ids, '{}'::uuid[])
  loop
    -- Only this admin's own, still-active clients get a message.
    if not exists (
      select 1 from public.users u
       where u.id = v_client_id
         and u.admin_id = v_admin_id
         and u.archived_at is null
         and u.deleted_at is null
    ) then
      continue;
    end if;

    select id into v_convo_id
      from public.conversations
     where admin_id = v_admin_id and client_id = v_client_id;
    if v_convo_id is null then
      insert into public.conversations (admin_id, client_id)
        values (v_admin_id, v_client_id)
        returning id into v_convo_id;
    end if;

    insert into public.messages
      (conversation_id, sender_id, recipient_id, body, kind, private_event_id)
    values
      (v_convo_id, v_admin_id, v_client_id, v_body, 'availability', p_event_id)
    returning id into v_msg_id;

    message_id := v_msg_id;
    conversation_id := v_convo_id;
    return next;
  end loop;

  update public.admin_private_events
     set mirrored_at = now()
   where id = p_event_id;
end;
$func$;

revoke all on function public.mirror_private_event_to_clients(uuid, uuid[], text) from public, anon;
grant execute on function public.mirror_private_event_to_clients(uuid, uuid[], text) to authenticated;

notify pgrst, 'reload schema';
