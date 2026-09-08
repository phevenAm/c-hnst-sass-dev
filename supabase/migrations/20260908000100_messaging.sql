-- ─────────────────────────────────────────────────────────────────────────────
-- Direct messaging: client ↔ their own counsellor.
--
-- Scope (v1):
--   * Every practice, not just agencies.
--   * A conversation is strictly one client and the admin who owns their
--     `users` row (users.admin_id). No group threads, no practice-level inbox,
--     no thread before a client is assigned to an admin.
--   * Agency managers get NO visibility into staff↔client message content.
--   * Text only, no attachments.
--   * Stored as plain text: the Postgres volume is already encrypted at rest by
--     the platform, and RLS below is the real access control. Session notes stay
--     the encrypted clinical record — this is meant for logistics.
--
-- Tables:
--   conversations  one row per (admin, client) pair, carries last_message_at
--                  for list ordering.
--   messages       sender_id + recipient_id are both denormalised (the pair is
--                  fixed) so realtime can filter on recipient_id and unread
--                  counts are a single indexed predicate.
--
-- Reads/writes go straight through PostgREST + realtime; the only RPCs are a
-- narrow "mark read" (RLS can't restrict UPDATE to one column) and an
-- idempotent "get or create conversation" helper.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Tables ─────────────────────────────────────────────────────────────────
create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  admin_id        uuid not null references public.users (id) on delete cascade,
  client_id       uuid not null references public.users (id) on delete cascade,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  unique (admin_id, client_id)
);

comment on table public.conversations is
  'One direct-message thread between a client and their owning admin (users.admin_id).';

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.users (id) on delete cascade,
  recipient_id    uuid not null references public.users (id) on delete cascade,
  body            text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at      timestamptz not null default now(),
  read_at         timestamptz
);

comment on table public.messages is
  'A single direct message. sender_id/recipient_id are denormalised from the conversation (the pair is fixed).';

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);

create index if not exists messages_unread_idx
  on public.messages (recipient_id, read_at)
  where read_at is null;

create index if not exists conversations_admin_idx  on public.conversations (admin_id, last_message_at desc);
create index if not exists conversations_client_idx on public.conversations (client_id, last_message_at desc);

-- ── last_message_at bump ───────────────────────────────────────────────────
-- SECURITY DEFINER so a sender doesn't need UPDATE on conversations just to
-- send a message; it only ever touches the one bookkeeping column.
create or replace function public.bump_conversation_last_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $func$
begin
  update public.conversations
     set last_message_at = new.created_at
   where id = new.conversation_id;
  return new;
end;
$func$;

revoke all on function public.bump_conversation_last_message() from public, anon, authenticated;

drop trigger if exists messages_bump_conversation on public.messages;
create trigger messages_bump_conversation
  after insert on public.messages
  for each row execute function public.bump_conversation_last_message();

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;

-- conversations: either party can read; either party can create it, but only
-- for a pair that actually exists (client's users.admin_id = the admin).
drop policy if exists "conversation parties read"   on public.conversations;
drop policy if exists "conversation parties create" on public.conversations;

create policy "conversation parties read"
  on public.conversations for select
  using (admin_id = auth.uid() or client_id = auth.uid());

create policy "conversation parties create"
  on public.conversations for insert
  with check (
    (admin_id = auth.uid() or client_id = auth.uid())
    and exists (
      select 1 from public.users u
      where u.id = conversations.client_id
        and u.admin_id = conversations.admin_id
    )
  );

-- messages: read if you're a party; insert only as yourself, into a
-- conversation you're in, with recipient_id forced to the other party.
drop policy if exists "message parties read"   on public.messages;
drop policy if exists "message sender inserts" on public.messages;

create policy "message parties read"
  on public.messages for select
  using (sender_id = auth.uid() or recipient_id = auth.uid());

create policy "message sender inserts"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and auth.uid() in (c.admin_id, c.client_id)
    )
    and recipient_id = (
      select case when c.admin_id = auth.uid() then c.client_id else c.admin_id end
      from public.conversations c
      where c.id = messages.conversation_id
    )
  );

-- No UPDATE / DELETE policy: edits and deletes aren't a v1 feature. "Mark read"
-- goes through the RPC below.

-- ── RPCs ───────────────────────────────────────────────────────────────────
-- Mark every message the caller received in a thread as read. SECURITY DEFINER
-- because there's no UPDATE policy; the WHERE clause is the guard.
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language sql
security definer
set search_path = ''
as $func$
  update public.messages
     set read_at = now()
   where conversation_id = p_conversation_id
     and recipient_id = auth.uid()
     and read_at is null;
$func$;

revoke all on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- Idempotent thread lookup/creation. Validates the caller is one of the pair
-- and that the pair is real, then returns the existing row or makes one.
create or replace function public.get_or_create_conversation(p_admin_id uuid, p_client_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_id uuid;
begin
  if auth.uid() not in (p_admin_id, p_client_id) then
    raise exception 'not a party to this conversation';
  end if;

  if not exists (
    select 1 from public.users u
    where u.id = p_client_id and u.admin_id = p_admin_id
  ) then
    raise exception 'client % is not assigned to admin %', p_client_id, p_admin_id;
  end if;

  select id into v_id
    from public.conversations
   where admin_id = p_admin_id and client_id = p_client_id;

  if v_id is null then
    insert into public.conversations (admin_id, client_id)
      values (p_admin_id, p_client_id)
      returning id into v_id;
  end if;

  return v_id;
end;
$func$;

revoke all on function public.get_or_create_conversation(uuid, uuid) from public, anon;
grant execute on function public.get_or_create_conversation(uuid, uuid) to authenticated;

-- List the caller's conversations, newest activity first, each enriched with
-- the other party's public profile fields, an unread count, and a preview of
-- the last message. SECURITY INVOKER — it only ever reads rows the caller's
-- RLS already allows, and the WHERE clause pins it to their own threads.
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
security invoker
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

-- ── Grants + realtime ──────────────────────────────────────────────────────
grant select, insert on public.conversations to authenticated;
grant select, insert on public.messages      to authenticated;

alter publication supabase_realtime add table public.messages;

notify pgrst, 'reload schema';
