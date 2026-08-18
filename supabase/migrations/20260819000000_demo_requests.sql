-- ─────────────────────────────────────────────────────────────────────────────
-- Gated demo access (todo: stop the public login page handing out full demo
-- access to anyone, including competitors).
--
-- /demo?for=<value> only shows the demo sign-in cards when <value> matches a
-- row here — either an email that went through the "request a demo" form, or
-- a pre-seeded "channel" token (e.g. 'linkedin') meant to be shared publicly
-- without collecting an email. used_count/last_used_at give a first cut of
-- analytics per channel; a fuller analytics pass can build on this later.
--
-- No RLS policies — anon/authenticated never touch this table directly.
-- Access goes through check_demo_access() (SECURITY DEFINER, public) and the
-- request-demo edge function (service role).
-- ─────────────────────────────────────────────────────────────────────────────

create table public.demo_requests (
  id uuid primary key default gen_random_uuid(),
  for_value text not null unique,
  kind text not null default 'email' check (kind in ('email', 'channel')),
  used_count integer not null default 0,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.demo_requests enable row level security;

create or replace function public.check_demo_access(p_for text)
returns boolean
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_matched boolean;
begin
  update public.demo_requests
  set used_count = used_count + 1, last_used_at = now()
  where for_value = lower(trim(p_for))
  returning true into v_matched;

  return coalesce(v_matched, false);
end;
$func$;

grant execute on function public.check_demo_access(text) to anon, authenticated;

-- Seed channel token for the LinkedIn profile link — shareable without an email gate.
insert into public.demo_requests (for_value, kind)
values ('linkedin', 'channel')
on conflict (for_value) do nothing;
