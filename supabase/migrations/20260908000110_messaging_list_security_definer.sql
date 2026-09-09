-- Fix: a client couldn't see their own conversation.
--
-- list_my_conversations() was SECURITY INVOKER and joins public.users to pull
-- the other party's name/avatar. The users table has no RLS policy letting a
-- client read their assigned admin's row (only "admins view own clients" and
-- "users view own row"), so for a client the join produced no rows — the
-- function returned nothing, MessagesView never got an `activeConvo`, and the
-- message composer never rendered. The admin side worked because an admin can
-- read their client's users row.
--
-- Make it SECURITY DEFINER. The WHERE clause already pins the result to the
-- caller's own conversations, and it only ever exposes the peer's
-- first/last/display name and avatar_url — the same profile fields shown all
-- over the app.

create or replace function public.list_my_conversations()
returns table (
  id              uuid,
  admin_id        uuid,
  client_id       uuid,
  created_at      timestamptz,
  last_message_at timestamptz,
  peer_id         uuid,
  peer_first_name text,
  peer_last_name  text,
  peer_display_name text,
  peer_avatar_url text,
  unread          bigint,
  last_message    text
)
language sql
stable
security definer
set search_path = ''
as $func$
  select
    c.id, c.admin_id, c.client_id, c.created_at, c.last_message_at,
    peer.id, peer.first_name, peer.last_name, peer.display_name, peer.avatar_url,
    coalesce((
      select count(*) from public.messages m
      where m.conversation_id = c.id
        and m.recipient_id = auth.uid()
        and m.read_at is null
    ), 0) as unread,
    (
      select m.body from public.messages m
      where m.conversation_id = c.id
      order by m.created_at desc
      limit 1
    ) as last_message
  from public.conversations c
  join public.users peer
    on peer.id = case when c.admin_id = auth.uid() then c.client_id else c.admin_id end
  where auth.uid() in (c.admin_id, c.client_id)
  order by c.last_message_at desc;
$func$;

revoke all on function public.list_my_conversations() from public, anon;
grant execute on function public.list_my_conversations() to authenticated;

notify pgrst, 'reload schema';
